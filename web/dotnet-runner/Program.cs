// Entry point for the browser-wasm runner. The runner itself is driven from
// JavaScript via the [JSExport] in Interop.cs — Main just completes startup so the
// .NET runtime is initialized and the export table is ready. The web app's
// dotnet-loader calls dotnet.create() and then ForgeRunner.Interop.CompileAndRun.
System.Console.WriteLine("ForgeRunner initialized.");
