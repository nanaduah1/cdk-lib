import { CfnOutput, Duration, RemovalPolicy } from "aws-cdk-lib";
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
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { ARecord, IHostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import { Bucket, BlockPublicAccess } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import {
  AwsCustomResource,
  PhysicalResourceId,
} from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
import { Function, FunctionCode } from "aws-cdk-lib/aws-cloudfront";

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

    new ARecord(this, "SiteRecord", {
      recordName: options.siteDomainName,
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
      zone: options.hostedZone,
    });

    const deploymentBucket = new BucketDeployment(
      this,
      "DeployWithInvalidation",
      {
        sources: [Source.asset(options.assetRootDir)],
        destinationBucket: s3Bucket,
        distribution,
        logRetention: RetentionDays.ONE_DAY,
        prune: true,
      }
    );

    // Write config.js file
    if (options.config) {
      const fileContent = `window["awsConfig"]=${JSON.stringify(
        options.config
      )};`;

      const configResourceId = Buffer.from(fileContent, "utf-8").toString(
        "base64"
      );

      const configFileName = options.configFileName || "awsConfig.js";
      new AwsCustomResource(this, "WriteS3ConfigFile", {
        logRetention: RetentionDays.ONE_DAY,
        onUpdate: {
          service: "S3",
          action: "putObject",
          parameters: {
            Body: fileContent,
            Bucket: deploymentBucket.deployedBucket.bucketName,
            Key: configFileName,
          },
          physicalResourceId: PhysicalResourceId.of(configResourceId),
        },
        // we need this because we're not doing conventional resource creation
        policy: {
          statements: [
            new PolicyStatement({
              actions: ["s3:PutObject"],
              resources: [`${s3Bucket.bucketArn}/${configFileName}`],
            }),
          ],
        },
      }).node.addDependency(distribution);
    }

    this.distribution = distribution;

    new CfnOutput(this, `${id} URL`, {
      value: `https://${options.siteDomainName} or https://${distribution.distributionDomainName}`,
    });
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
