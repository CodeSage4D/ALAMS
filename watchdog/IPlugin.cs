namespace AlamsDaemon
{
    public interface IPlugin
    {
        string Name { get; }
        void Initialize(string configDir);
        void Execute();
    }
}
