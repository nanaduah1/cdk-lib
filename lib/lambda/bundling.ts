type DependencyProps = {
  url: string;
  name: string;
  version: string;
  type: string;
};
export class PoetryLockParser {
  getLocalDependencies(exampleLockFile: string): DependencyProps[] {
    const dependencies = this.getDependencies(exampleLockFile);
    const localDeps = dependencies.filter((d) => d.type === "directory");
    return localDeps;
  }

  private getDependencies(exampleLockFile: string): DependencyProps[] {
    const dependencies = exampleLockFile.split("[[package]]");
    const deps = dependencies.map((d) => {
      const dependency = d.split("\n").reduce((state: any, line) => {
        const dep = this.parseLine(line);
        if (Object.keys(dep).length > 0) {
          return { ...state, ...dep };
        }
        return { ...state };
      }, {});

      return dependency;
    });
    return deps;
  }

  private parseLine(line: string) {
    if (!line || !line.includes("=")) return {};
    const [name, value] = line.split("=");
    const cleanedValue = value.replace(/"/g, "").trim();
    return { [name.trim()]: cleanedValue };
  }
}
