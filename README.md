# Welcome to Cloudo

This repository contains high level AWS CDK constructs.
These are designed for my personal and organizational use cases.

You may use it in your own projects if it fits your needs. Please do so at your own risk!

I do not guarantee these are good for your own use, bug free or safe to use.

## Top Level Constructs

To create a any app, we would create one of these

- API: A web API
- StaticSite: A web site created from html css etc
- Job: Some background job triggered by an event or a time schedule

APP -> CloudoApp -> Api | StaticSite | Job
| - Bucket - Authentication -

import { ILayerVersion } from "aws-cdk-lib/aws-lambda";

type PythonFunctionV2Props = {
path: string;
description?: string;
environment?: { [key: string]: string };
layers?: ILayerVersion[];
};

/\*\*

- Creates a new AWS Lambda function using python runtime.
- @param path The path to the python function in the format "path/to/functionRootFolder".
- When using poetry to manage dependencies path must be "path/to/functionRootFolder[.poetry]", the function root folder is the folder containing the pyproject.toml file.
- The handler function must be in a file named "handler.py" in the package folder.
- @param dependencyManager The dependency manager to use. Defaults to "poetry".
  \*/
  export class PythonFunctionV2 extends Construct {
  constructor(scope: Construct, id: string, props: PythonFunctionV2Props) {
  super(scope, id);

      const { path, description, environment, layers } = props;

      let handlerFileName = "handler.py";
      let handlerFunctionName = "handler";
      let functionRootFolder = path;

      if (path.includes(".poetry")) {
        // Poetry project has a package folder with all lower case letters named the same as the project name
        const projectName = path.split(".").splice(-1)[0];
        handlerFileName = `${projectName.toLocaleLowerCase()}/handler.py`;
      }
      const f = new PythonLambdaFunction(this, "Function", {
        functionRootFolder: functionRootFolder,
        handlerFileName,
        handler: handlerFunctionName,
        description,
        environment,
        layers,
      });

  }
  }
