import * as path from "path";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import {
  BlockPublicAccess,
  Bucket,
  BucketAccessControl,
  HttpMethods,
  IBucket,
} from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import {
  HttpApi,
  HttpMethod,
  HttpNoneAuthorizer,
} from "aws-cdk-lib/aws-apigatewayv2";
import { PythonFunction } from "@aws-cdk/aws-lambda-python-alpha";

type ClientUploadBucketProps = {
  routePath?: string;
  allowedOrigins: string[];
  allowedHeaders?: string[];
  apiGateway: HttpApi;
  region?: string;
};

export class ClientUploadBucket extends Construct {
  public readonly UploadBucket: IBucket;
  constructor(scope: Construct, id: string, options: ClientUploadBucketProps) {
    super(scope, id);

    const uploadBucket = new Bucket(this, "FileUploadBucket", {
      cors: [
        {
          allowedMethods: [HttpMethods.GET, HttpMethods.PUT, HttpMethods.HEAD],
          allowedOrigins: options.allowedOrigins,
          allowedHeaders: options.allowedHeaders || ["*"],
        },
      ],
      accessControl: BucketAccessControl.PRIVATE,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    });

    const uploadLambda2 = new PythonFunction(this, "UploadToBucket", {
      runtime: Runtime.PYTHON_3_9,
      entry: path.join(path.dirname(__filename), "lambda"),
      index: "handler.py",
      logRetention: RetentionDays.ONE_DAY,
      environment: {
        BucketName: uploadBucket.bucketName,
        BucketRegion: options.region || "us-east-1",
      },
    });

    const lambdaIntegration = new HttpLambdaIntegration(
      `${id}-AssetUpload-Lambda-Integration`,
      uploadLambda2
    );

    options.apiGateway.addRoutes({
      path: options.routePath || "/api/uploads",
      integration: lambdaIntegration,
      methods: [HttpMethod.PUT, HttpMethod.GET, HttpMethod.OPTIONS],
      authorizer: new HttpNoneAuthorizer(),
    });

    uploadBucket.grantPut(uploadLambda2);
    uploadBucket.grantRead(uploadLambda2);
    this.UploadBucket = uploadBucket;
  }
}
