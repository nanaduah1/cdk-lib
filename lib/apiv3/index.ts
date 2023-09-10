import {
  HttpApi,
  HttpMethod,
  HttpNoneAuthorizer,
  IHttpRouteAuthorizer,
} from "@aws-cdk/aws-apigatewayv2-alpha";
import { IFunction } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { Duration } from "aws-cdk-lib";
import { FunctionConfig } from "../types";
import { BaseApp, PythonLambdaApiV2 } from "..";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Queue } from "aws-cdk-lib/aws-sqs";

type RouteApiProps = {
  authorizer?: IHttpRouteAuthorizer;
};

type RouteProps = string | { [key: string]: FunctionConfig & RouteApiProps };

type PythonApiProps = {
  httpApi: HttpApi;
  authorizer?: IHttpRouteAuthorizer;
  functions?: FunctionConfig;

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

const HttpMethodDescriptionMap: { [key: string]: string } = {
  GET: "Get",
  POST: "Create",
  PUT: "Update",
  DELETE: "Delete",
  PATCH: "Update",
  ANY: "Endpoint",
};

export class PythonApi extends Construct {
  private readonly functions: IFunction[] = [];
  constructor(scope: BaseApp, id: string, props: PythonApiProps) {
    super(scope, id);

    const { httpApi, routes, authorizer, functions } = props;

    const mergedFunctionProps = this.mergeProps(scope.functions, functions);

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
      const methodDescription = HttpMethodDescriptionMap[method.toUpperCase()];
      const id = [methodDescription,projectName,method, combinedFunctionProps.name ?? ""] `${methodDescription}-${projectName}-${method}`;
      const endpointAuthorizer =
        functionProps.authorizer || authorizer || new HttpNoneAuthorizer();
      const enpoint = new PythonLambdaApiV2(this, id, {
        apiGateway: httpApi,
        routePaths: routePath,
        authorizer: endpointAuthorizer,
        functionRootFolder: lambadaRootPath,
        displayName: `${combinedFunctionProps.name ?? ''}${methodDescription} ${projectName} Endpoint`,
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

      combinedFunctionProps?.permissions?.forEach((resource) => {
        if (resource instanceof Table) {
          resource.grantReadWriteData(enpoint.lambadaFunction);
        } else if (resource instanceof Bucket) {
          resource.grantReadWrite(enpoint.lambadaFunction);
        } else if (resource instanceof Queue) {
          resource.grantSendMessages(enpoint.lambadaFunction);
        }
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
      permissions: [...(one?.permissions || []), ...(two?.permissions || [])],
    };
  }
}
