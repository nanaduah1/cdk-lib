import {
  HttpApi,
  HttpMethod,
  HttpNoneAuthorizer,
  IHttpRouteAuthorizer,
} from "@aws-cdk/aws-apigatewayv2-alpha";
import { IFunction } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { Duration } from "aws-cdk-lib";
import { PythonLambdaApiV2 } from "../apiv2";
import { FunctionConfig } from "../types";
import { BaseApp } from "..";

type RouteProps = string | { [key: string]: FunctionConfig };

type PythonApiProps = {
  httpApi: HttpApi;
  authorizer?: IHttpRouteAuthorizer;
  function?: FunctionConfig;

  /**Defines the API routes using the syntax
   * Method:/path/to/resource/{param1}/{param2}:file/path/to/lambada/function/root
   * If you want to specify additional properties for the lambda function, you can use the following syntax
   * Method:/path/to/resource/{param1}/{param2}:file/path/to/lambada/function/root: { memorySize: 128, timeout: 10}
   */
  routes: RouteProps[];
};

const HttpMethodMap: { [key: string]: HttpMethod } = {
  GET: HttpMethod.GET,
  POST: HttpMethod.POST,
  PUT: HttpMethod.PUT,
  DELETE: HttpMethod.DELETE,
  PATCH: HttpMethod.PATCH,
  OPTIONS: HttpMethod.OPTIONS,
  ANY: HttpMethod.ANY,
};

export class PythonApi extends Construct {
  private readonly functions: IFunction[] = [];
  constructor(scope: BaseApp, id: string, props: PythonApiProps) {
    super(scope, id);

    const { httpApi, routes, authorizer, function: fnProps } = props;

    const mergedFunctionProps = this.mergeProps(scope.functions, fnProps);

    routes.forEach((route) => {
      const routeKey =
        typeof route === "string" ? route : Object.keys(route)[0];
      const functionProps =
        (typeof route === "string" ? {} : route[routeKey]) || {};

      const combinedFunctionProps = this.mergeProps(
        mergedFunctionProps,
        functionProps
      );

      const [method, routePath, lambadaRootPath] = routeKey.split(":");
      const projectName = lambadaRootPath.split("/").slice(-1)[0];

      const enpoint = new PythonLambdaApiV2(this, `${id}-${method}`, {
        apiGateway: httpApi,
        routePaths: routePath,
        authorizer: authorizer ?? new HttpNoneAuthorizer(),
        functionRootFolder: lambadaRootPath,
        displayName: `${projectName} ${method.toUpperCase()}`,
        handlerFileName: `${projectName.toLowerCase()}/handler.py`,
        httpMethods: [HttpMethodMap[method.toUpperCase()]],
        timeout:
          typeof combinedFunctionProps?.timeout === "number"
            ? Duration.seconds(combinedFunctionProps.timeout)
            : undefined,
        logRetention: combinedFunctionProps?.logRetention,
        layers: combinedFunctionProps?.layers,
        memorySize: combinedFunctionProps?.memorySize,
        environment: combinedFunctionProps?.environment,
      });

      combinedFunctionProps?.db?.forEach((table) => {
        table.grantReadWriteData(enpoint.lambadaFunction);
      });

      this.functions.push(enpoint.lambadaFunction);
    });
  }

  /**
   * Returns the lambda function at the specified index
   * @param index The index of the lambda function based on the order of the routes
   */
  get(index: number) {
    return this.functions[index];
  }

  /**
   * Combines the properties of two functions
   * @param one The first object
   * @param two The second object. This object will override the first object if there are any conflicts
   * @returns The merged object
   */
  private mergeProps(
    one?: FunctionConfig,
    two?: FunctionConfig
  ): FunctionConfig {
    return {
      ...one,
      ...two,
      environment: {
        ...one?.environment,
        ...two?.environment,
      },
      layers: [...(one?.layers || []), ...(two?.layers || [])],
      db: [...(one?.db || []), ...(two?.db || [])],
    };
  }
}
