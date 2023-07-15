import { CfnOutput, Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import {
  Certificate,
  CertificateValidation,
} from "aws-cdk-lib/aws-certificatemanager";
import {
  OriginAccessIdentity,
  ViewerProtocolPolicy,
  HttpVersion,
  PriceClass,
  Distribution,
  FunctionEventType,
  IOrigin,
} from "aws-cdk-lib/aws-cloudfront";
import { S3Origin } from "aws-cdk-lib/aws-cloudfront-origins";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { ARecord, IHostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import { Bucket, BlockPublicAccess } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { Function, FunctionCode } from "aws-cdk-lib/aws-cloudfront";
import fs = require("fs");
import path = require("path");
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import {
  AwsCustomResource,
  AwsSdkCall,
  PhysicalResourceId,
} from "aws-cdk-lib/custom-resources";

type StaticWebsiteV2Props = {
  configFileName?: string;
  config?: any;
  assetRootDir: string;
  hostedZone: IHostedZone;
  siteDomainName: string;
  websiteErrorDocument?: string;
  websiteIndexDocument?: string;
  cacheConfig?: { [path: string]: boolean };
};

export class StaticWebsiteV2 extends Construct {
  readonly distribution: Distribution;
  constructor(scope: Construct, id: string, options: StaticWebsiteV2Props) {
    super(scope, id);

    const { cacheConfig } = options;

    const domainCertificate = new Certificate(this, "SiteCertificate", {
      validation: CertificateValidation.fromDns(options.hostedZone),
      domainName: options.siteDomainName,
    });

    const s3Bucket = new Bucket(this, "SiteAssets", {
      publicReadAccess: false,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const cacheStrategy = cacheConfig ?? { "static/*": true };
    const siteOrigin = new S3Origin(s3Bucket);
    const accessIdentity = new OriginAccessIdentity(this, "CloudfrontAccess");
    const cloudfrontUserAccessPolicy = new PolicyStatement();
    cloudfrontUserAccessPolicy.addActions("s3:GetObject");
    cloudfrontUserAccessPolicy.addPrincipals(accessIdentity.grantPrincipal);
    cloudfrontUserAccessPolicy.addResources(s3Bucket.arnForObjects("*"));

    const additionalBehaviors = buildCacheConfig(
      this,
      siteOrigin,
      cacheStrategy
    );

    const distribution = new Distribution(this, "CloudfrontDistribution", {
      priceClass: PriceClass.PRICE_CLASS_100,
      httpVersion: HttpVersion.HTTP2_AND_3,
      defaultBehavior: {
        origin: siteOrigin,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        compress: true,
      },
      defaultRootObject: "index.html",
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
        },
        {
          httpStatus: 403,
          responseHttpStatus: 403,
          responsePagePath: "/index.html",
        },
      ],
      additionalBehaviors,
      domainNames: [options.siteDomainName],
      certificate: domainCertificate,
    });

    const bucketDeployment = new BucketDeployment(
      this,
      "DeployWithInvalidation",
      {
        sources: [Source.asset(options.assetRootDir)],
        destinationBucket: s3Bucket,
        // distribution,
        logRetention: RetentionDays.ONE_DAY,
        prune: true,
      }
    );

    // Write config.js file
    let configWriter: AwsCustomResource | undefined;
    if (options.config) {
      const fileContent = `window["awsConfig"]=${JSON.stringify(
        options.config
      )};`;

      const configFileName = options.configFileName || "awsConfig.js";
      const sdkCall: AwsSdkCall = {
        service: "S3",
        action: "putObject",
        parameters: {
          Body: fileContent,
          Bucket: bucketDeployment.deployedBucket.bucketName,
          Key: configFileName,
        },
        physicalResourceId: PhysicalResourceId.of(new Date().toISOString()),
      };
      configWriter = new AwsCustomResource(this, "WriteS3ConfigFile", {
        logRetention: RetentionDays.ONE_DAY,
        onUpdate: sdkCall,
        onCreate: sdkCall,
        // we need this because we're not doing conventional resource creation
        policy: {
          statements: [
            new PolicyStatement({
              actions: ["s3:PutObject"],
              resources: [`${s3Bucket.bucketArn}/${configFileName}`],
            }),
          ],
        },
      });
      configWriter.node.addDependency(distribution);
      configWriter.node.addDependency(bucketDeployment);
    }

    new ARecord(this, "SiteRecord", {
      recordName: options.siteDomainName,
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
      zone: options.hostedZone,
    });

    const sdkCall: AwsSdkCall = {
      service: "CloudFront",
      action: "createInvalidation",
      parameters: {
        DistributionId: distribution.distributionId,
        InvalidationBatch: {
          CallerReference: new Date().toISOString(),
          Paths: {
            Quantity: 1,
            Items: ["/*"],
          },
        },
      },
      physicalResourceId: PhysicalResourceId.of(new Date().toISOString()),
    };
    const cacheInvalidator = new AwsCustomResource(this, "CacheInvalidator", {
      logRetention: RetentionDays.ONE_DAY,
      onCreate: sdkCall,
      onUpdate: sdkCall,
      policy: {
        statements: [
          new PolicyStatement({
            actions: ["cloudfront:CreateInvalidation"],
            resources: [
              `arn:aws:cloudfront::${Stack.of(this).account}:distribution/${
                distribution.distributionId
              }`,
            ],
          }),
        ],
      },
    });
    cacheInvalidator.node.addDependency(bucketDeployment);
    cacheInvalidator.node.addDependency(distribution);
    if (configWriter) {
      cacheInvalidator.node.addDependency(configWriter);
    }

    this.distribution = distribution;
  }
}

function createCacheAssetHandler(scope: Construct, ttl?: Duration) {
  const fnCodeToCache = `function handler(event) {
    var response = event.response;
    var headers = response.headers;
    headers['cache-control'] = {value: 'public,max-age=${
      ttl?.toSeconds() ?? "31536000"
    },immutable'};
    return response;
  }`;

  return new Function(scope, "ViewerResponseFunction", {
    code: FunctionCode.fromInline(fnCodeToCache),
  });
}

function createNoCacheAssetHandler(scope: Construct) {
  const fnCodeNoCache = `function handler(event) {
    var response = event.response;
    var headers = response.headers;
    headers['cache-control'] = {value: 'public,max-age=0,must-revalidate'};
    return response;
  }`;

  return new Function(scope, "ViewerResponseNoCacheFunction", {
    code: FunctionCode.fromInline(fnCodeNoCache),
  });
}

function buildCacheConfig(
  scope: Construct,
  origin: IOrigin,
  cacheConfig: { [path: string]: boolean }
) {
  if (!cacheConfig) return undefined;

  let cacheFunc = undefined;
  let noCacheFunc = undefined;

  const cacheBehavior: any = {};
  for (const path in cacheConfig) {
    const isCacheEnabled = cacheConfig[path];
    if (isCacheEnabled) {
      cacheFunc = cacheFunc ?? createCacheAssetHandler(scope);
    } else noCacheFunc = noCacheFunc ?? createNoCacheAssetHandler(scope);

    cacheBehavior[path] = {
      origin: origin,
      functionAssociations: [
        {
          function: isCacheEnabled ? cacheFunc : noCacheFunc,
          eventType: FunctionEventType.VIEWER_RESPONSE,
        },
      ],
    };
  }

  return cacheBehavior;
}
