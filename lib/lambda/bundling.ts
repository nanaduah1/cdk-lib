import fs, { readFileSync } from "fs";
import path from "path";

type DependencyProps = {
  url: string;
  name: string;
  version: string;
  type: string;
};
export class PoetryLockParser {
  getLocalDependencies(projectDirectory: string): DependencyProps[] {
    const lockfile = path.join(projectDirectory, "poetry.lock");
    if (fs.existsSync(lockfile)) {
      const lockFileContent = fs.readFileSync(path.join(lockfile), "utf-8");
      const dependencies = this.getDependencies(lockFileContent);
      return dependencies.filter((d) => d.type === "directory");
    }
    return [];
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
