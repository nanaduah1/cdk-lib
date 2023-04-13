import { CfnOutput, RemovalPolicy } from "aws-cdk-lib";
import {
  Certificate,
  CertificateValidation,
} from "aws-cdk-lib/aws-certificatemanager";
import {
  CloudFrontWebDistribution,
  Distribution,
  HttpVersion,
  IDistribution,
  OriginAccessIdentity,
  PriceClass,
  ViewerCertificate,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { ARecord, IHostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import { BlockPublicAccess, Bucket } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import {
  AwsCustomResource,
  PhysicalResourceId,
} from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";

type StaticWebsiteProps = {
  configFileName?: string;
  config?: any;
  assetRootDir: string;
  hostedZone?: IHostedZone;
  siteDomainName?: string;
};
export class StaticWebsite extends Construct {
  readonly distribution: Distribution;
  constructor(scope: Construct, id: string, options: StaticWebsiteProps) {
    super(scope, id);

    let domainCertificate = null;
    if (
      typeof options.hostedZone !== "undefined" &&
      typeof options.siteDomainName !== "undefined"
    ) {
      domainCertificate = new Certificate(this, "SiteCertificate", {
        validation: CertificateValidation.fromDns(options.hostedZone),
        domainName: options.siteDomainName,
      });
    }

    const s3Bucket = new Bucket(this, "SiteAssets", {
      publicReadAccess: false,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const accessIdentity = new OriginAccessIdentity(this, "CloudfrontAccess");
    const cloudfrontUserAccessPolicy = new PolicyStatement();
    cloudfrontUserAccessPolicy.addActions("s3:GetObject");
    cloudfrontUserAccessPolicy.addPrincipals(accessIdentity.grantPrincipal);
    cloudfrontUserAccessPolicy.addResources(s3Bucket.arnForObjects("*"));

    const siteDistribution = new CloudFrontWebDistribution(this, "CloudFront", {
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: s3Bucket,
            originAccessIdentity: accessIdentity,
          },
          behaviors: [
            {
              isDefaultBehavior: true,
              compress: true,
            },
          ],
        },
      ],
      defaultRootObject: "index.html",
      errorConfigurations: [
        {
          errorCode: 403,
          responseCode: 200,
          responsePagePath: "/index.html",
        },
      ],
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      httpVersion: HttpVersion.HTTP2,
      priceClass: PriceClass.PRICE_CLASS_100,
      viewerCertificate:
        domainCertificate == null
          ? undefined
          : ViewerCertificate.fromAcmCertificate(domainCertificate, {
              aliases: options.siteDomainName
                ? [options.siteDomainName]
                : undefined,
            }),
    });

    if (typeof options.hostedZone !== "undefined")
      //Create A Record Custom Domain to CloudFront CDN
      new ARecord(this, "SiteRecord", {
        recordName: options.siteDomainName,
        target: RecordTarget.fromAlias(new CloudFrontTarget(siteDistribution)),
        zone: options.hostedZone,
      });

    const deploymentBucket = new BucketDeployment(
      this,
      "DeployWithInvalidation",
      {
        sources: [Source.asset(options.assetRootDir)],
        destinationBucket: s3Bucket,
        distribution: siteDistribution,
        logRetention: RetentionDays.ONE_DAY,
        // prune: true,
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
          physicalResourceId: PhysicalResourceId.of(new Date().toISOString()),
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
      }).node.addDependency(siteDistribution);
    }

    new CfnOutput(this, `WebsiteURL`, {
      value: `https://${options.siteDomainName} or https://${siteDistribution.distributionDomainName}`,
    });
  }
}
