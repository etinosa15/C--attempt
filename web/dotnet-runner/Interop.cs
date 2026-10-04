using System.Reflection;
using System.Runtime.InteropServices.JavaScript;
using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Emit;

namespace ForgeRunner;

// The JS-facing surface of the in-browser C# runner. `CompileAndRun` takes a full
// Program.cs source (already wrapped in the test harness by the web app's
// cs-harness.ts), compiles it with Roslyn, runs it capturing stdout, and returns a
// small JSON result that the web app parses + grades. No file system or server is
// involved — compilation and execution both happen in this WASM module.
//
// Result JSON (matches CsWasmResult in dotnet-loader.ts):
//   { "stdout": "...", "runtimeError": "...", "compileError": "...", "timedOut": false }
public static partial class Interop
{
    private static readonly HttpClient Http = new();

    // Roslyn references, loaded once. In browser-wasm an assembly's `Location` is
    // empty (assemblies aren't on a file system), so we fetch each loaded runtime
    // assembly's bytes over HTTP from _framework and build metadata references from
    // the PE image. This relies on WasmEnableWebcil=false (see the csproj) so the
    // served assemblies are real PE `.dll` files Roslyn can read.
    private static List<MetadataReference>? _references;

    [JSExport]
    internal static async Task<string> Init()
    {
        _references ??= await LoadReferencesAsync();
        return JsonSerializer.Serialize(new { ready = true, references = _references.Count });
    }

    [JSExport]
    internal static string CompileAndRun(string source)
    {
        try
        {
            if (_references is null)
            {
                // Init() should have been awaited first; be defensive.
                return JsonSerializer.Serialize(new { compileError = "Runtime not initialized." });
            }

            var tree = CSharpSyntaxTree.ParseText(source);
            var compilation = CSharpCompilation.Create(
                "Submission",
                new[] { tree },
                _references,
                new CSharpCompilationOptions(
                    OutputKind.ConsoleApplication,
                    allowUnsafe: false,
                    optimizationLevel: OptimizationLevel.Release,
                    nullableContextOptions: NullableContextOptions.Enable));

            using var pe = new MemoryStream();
            EmitResult emit = compilation.Emit(pe);
            if (!emit.Success)
            {
                var errors = string.Join(
                    "\n",
                    emit.Diagnostics
                        .Where(d => d.Severity == DiagnosticSeverity.Error)
                        .Select(d => d.ToString()));
                return JsonSerializer.Serialize(new { compileError = errors });
            }

            pe.Seek(0, SeekOrigin.Begin);
            Assembly asm = Assembly.Load(pe.ToArray());
            MethodInfo? entry = asm.EntryPoint;
            if (entry is null)
            {
                return JsonSerializer.Serialize(new { runtimeError = "No entry point was produced." });
            }

            // Capture Console output while the submission runs.
            TextWriter original = Console.Out;
            var captured = new StringWriter();
            Console.SetOut(captured);
            string? runtimeError = null;
            try
            {
                // Top-level-statement programs compile to a Main taking string[].
                object?[]? args = entry.GetParameters().Length == 1
                    ? new object?[] { Array.Empty<string>() }
                    : null;
                entry.Invoke(null, args);
            }
            catch (TargetInvocationException tie)
            {
                runtimeError = (tie.InnerException ?? tie).Message;
            }
            catch (Exception ex)
            {
                runtimeError = ex.Message;
            }
            finally
            {
                Console.SetOut(original);
            }

            // VERIFY (Unit 2): single-threaded WASM can't pre-empt an infinite loop
            // in the submission, so there is no hard wall-clock timeout here yet —
            // a runaway loop would hang the tab. Options: WasmEnableThreads + a
            // watchdog, or a Roslyn rewrite that injects cooperative cancellation
            // checks. Until then the `timedOut` field is never set by this side.
            return JsonSerializer.Serialize(new { stdout = captured.ToString(), runtimeError });
        }
        catch (Exception ex)
        {
            return JsonSerializer.Serialize(new { compileError = ex.Message });
        }
    }

    private static async Task<List<MetadataReference>> LoadReferencesAsync()
    {
        var refs = new List<MetadataReference>();
        foreach (Assembly asm in AppDomain.CurrentDomain.GetAssemblies())
        {
            if (asm.IsDynamic) continue;
            string? name = asm.GetName().Name;
            if (string.IsNullOrEmpty(name)) continue;
            try
            {
                // VERIFY (Unit 2): the served path/extension for framework
                // assemblies is runtime-version dependent. With WasmEnableWebcil
                // false they are PE `.dll`s under _framework; confirm the exact URL
                // (and whether a cache-busting query/fingerprint is needed) against
                // a real publish.
                byte[] bytes = await Http.GetByteArrayAsync($"_framework/{name}.dll");
                refs.Add(MetadataReference.CreateFromImage(bytes));
            }
            catch
            {
                // Skip anything that isn't fetchable as a PE image; the common BCL
                // assemblies the lessons use will still be present.
            }
        }
        return refs;
    }
}
