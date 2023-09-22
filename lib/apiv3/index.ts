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

const default_handler_module = "handler.handler";

export class PythonApi extends Construct {
  private readonly functions: { [id: string | number]: IFunction } = {};
  constructor(scope: BaseApp, id: string, props: PythonApiProps) {
    super(scope, id);

    const { httpApi, routes, authorizer, functions } = props;

    const mergedFunctionProps = this.mergeProps(scope.functions, functions);

    routes.forEach((route, routeIndex) => {
      const routeKey =
        typeof route === "string" ? route : Object.keys(route)[0];
      const functionProps =
        (typeof route === "string" ? {} : route[routeKey]) || {};

      const combinedFunctionProps = this.mergeProps(
        mergedFunctionProps,
        functionProps
      );

      const [method, routePath, lambadaRootPath, handler_module] =
        routeKey.split(":");
      const projectName = lambadaRootPath.split("/").slice(-1)[0];
      const methodDescription = HttpMethodDescriptionMap[method.toUpperCase()];
      const id = [
        methodDescription,
        projectName,
        method,
        combinedFunctionProps.name ?? "",
      ].join("-");
      const endpointAuthorizer =
        functionProps.authorizer || authorizer || new HttpNoneAuthorizer();

      // Determine the handler module of the associated function
      const resolved_handler_module = handler_module || default_handler_module;
      const [handler_module_name, handler_func_name] =
        resolved_handler_module.split(".");

      const enpoint = new PythonLambdaApiV2(this, id, {
        apiGateway: httpApi,
        routePaths: routePath,
        authorizer: endpointAuthorizer,
        functionRootFolder: lambadaRootPath,
        displayName: `${
          combinedFunctionProps.name ?? ""
        }${methodDescription} ${projectName} Endpoint`,
        handlerFileName: `${projectName.toLowerCase()}/${handler_module_name}.py`,
        handler: handler_func_name,
        httpMethods: [HttpMethodMap[method.toUpperCase()]],
        timeout:
          typeof combinedFunctionProps?.timeout === "number"
            ? Duration.seconds(combinedFunctionProps.timeout)
            : undefined,
        logRetention: combinedFunctionProps?.logRetention,
        layers: combinedFunctionProps?.layers,
        memorySize: combinedFunctionProps?.memorySize,
        environment: combinedFunctionProps?.environment,
        runtime: combinedFunctionProps?.runtime,
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

      // To support referencing a function by name of index in the routes array
      // we need to map the functions to the index of the route and the name of the function
      this.functions[routeIndex] = enpoint.lambadaFunction;

      // If the function has a name, we also want to map the function to the name
      if (combinedFunctionProps.name) {
        this.functions[combinedFunctionProps.name] = enpoint.lambadaFunction;
      }
    });
  }

  /**
   * Returns the lambda function at the specified index
   * @param index The index of the lambda function based on the order of the routes
   */
  get(index: number | string) {
    const lambda = this.functions[index];
    if (!lambda) {
      throw new Error(
        `No lambda function found at index ${index}. You can use the name of the function instead of the index to reference the function`
      );
    }
    return lambda;
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
