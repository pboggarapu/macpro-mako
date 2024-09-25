import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { join } from "path";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { ISubnet } from "aws-cdk-lib/aws-ec2";
import { CfnEventSourceMapping } from "aws-cdk-lib/aws-lambda";
import * as LC from "local-constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

interface EmailServiceStackProps extends cdk.StackProps {
  project: string;
  stage: string;
  isDev: boolean;
  stack: string;
  vpc: cdk.aws_ec2.IVpc;
  applicationEndpointUrl: string;
  emailFromIdentity: string;
  indexNamespace: string;
  emailAddressLookupSecretName: string;
  topicNamespace: string;
  privateSubnets: ISubnet[];
  lambdaSecurityGroupId: string;
  brokerString: string;
  lambdaSecurityGroup: cdk.aws_ec2.SecurityGroup;
  openSearchDomainEndpoint: string;
  openSearchDomainArn: string;
  userPoolId: string;
  emailIdentityDomain: string;
}

export class Email extends cdk.NestedStack {
  constructor(scope: Construct, id: string, props: EmailServiceStackProps) {
    super(scope, id, props);

    const {
      project,
      stage,
      isDev,
      stack,
      vpc,
      applicationEndpointUrl,
      userPoolId,
      emailFromIdentity,
      topicNamespace,
      indexNamespace,
      emailAddressLookupSecretName,
      brokerString,
      lambdaSecurityGroupId,
      privateSubnets,
      lambdaSecurityGroup,
      openSearchDomainEndpoint,
      openSearchDomainArn,
      emailIdentityDomain,
    } = props;
    // KMS Key for SNS Topic
    const kmsKeyForEmails = new cdk.aws_kms.Key(this, "KmsKeyForEmails", {
      enableKeyRotation: true,
      policy: new cdk.aws_iam.PolicyDocument({
        statements: [
          new cdk.aws_iam.PolicyStatement({
            actions: ["kms:*"],
            principals: [new cdk.aws_iam.AccountRootPrincipal()],
            resources: ["*"],
          }),
          new cdk.aws_iam.PolicyStatement({
            actions: ["kms:GenerateDataKey", "kms:Decrypt"],
            principals: [new cdk.aws_iam.ServicePrincipal("sns.amazonaws.com")],
            resources: ["*"],
          }),
          new cdk.aws_iam.PolicyStatement({
            actions: ["kms:GenerateDataKey", "kms:Decrypt"],
            principals: [new cdk.aws_iam.ServicePrincipal("ses.amazonaws.com")],
            resources: ["*"],
          }),
        ],
      }),
    });

    // SNS Topic for Email Events
    const emailEventTopic = new cdk.aws_sns.Topic(this, "EmailEventTopic", {
      displayName: "Monitoring the sending of emails",
      masterKey: kmsKeyForEmails,
    });

    // Allow SES to publish to the SNS topic
    const snsPublishPolicyStatement = new cdk.aws_iam.PolicyStatement({
      actions: ["sns:Publish"],
      principals: [new cdk.aws_iam.ServicePrincipal("ses.amazonaws.com")],
      resources: [emailEventTopic.topicArn],
      effect: cdk.aws_iam.Effect.ALLOW,
    });
    emailEventTopic.addToResourcePolicy(snsPublishPolicyStatement);

    // S3 Bucket for storing email event data
    const emailDataBucket = new cdk.aws_s3.Bucket(this, "EmailDataBucket", {
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: isDev,
    });

    emailDataBucket.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.DENY,
        principals: [new cdk.aws_iam.AnyPrincipal()],
        actions: ["s3:*"],
        resources: [
          emailDataBucket.bucketArn,
          `${emailDataBucket.bucketArn}/*`,
        ],
        conditions: {
          Bool: { "aws:SecureTransport": "false" },
        },
      }),
    );

    new LC.EmptyBuckets(this, "EmptyBuckets", {
      buckets: [emailDataBucket],
    });
    // SES Configuration Set
    const configurationSet = new cdk.aws_ses.CfnConfigurationSet(
      this,
      "ConfigurationSet",
      {
        name: `${project}-${stage}-${stack}-email-configuration-set`,
        reputationOptions: {
          reputationMetricsEnabled: true,
        },
        sendingOptions: {
          sendingEnabled: true,
        },
        suppressionOptions: {
          suppressedReasons: ["BOUNCE", "COMPLAINT"],
        },
      },
    );

    const snsTopicPolicy = emailEventTopic.node.tryFindChild(
      "Policy",
    ) as cdk.CfnResource;

    // SES Event Destination for Configuration Set
    const eventDestination =
      new cdk.aws_ses.CfnConfigurationSetEventDestination(
        this,
        "ConfigurationSetEventDestination",
        {
          configurationSetName: configurationSet.name!,
          eventDestination: {
            enabled: true,
            matchingEventTypes: [
              "send",
              "reject",
              "bounce",
              "complaint",
              "delivery",
              "open",
              "click",
              "renderingFailure",
            ],
            snsDestination: {
              topicArn: emailEventTopic.topicArn,
            },
          },
        },
      );

    eventDestination.node.addDependency(snsTopicPolicy);

    // IAM Role for Lambda
    const lambdaRole = new cdk.aws_iam.Role(this, "LambdaExecutionRole", {
      assumedBy: new cdk.aws_iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole",
        ),
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaVPCAccessExecutionRole",
        ),
      ],
      inlinePolicies: {
        EmailServicePolicy: new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: [
                "es:ESHttpHead",
                "es:ESHttpPost",
                "es:ESHttpGet",
                "es:ESHttpPatch",
                "es:ESHttpDelete",
                "es:ESHttpPut",
              ],
              resources: [`${openSearchDomainArn}/*`],
            }),
            new cdk.aws_iam.PolicyStatement({
              actions: [
                "ses:SendEmail",
                "ses:SendRawEmail",
                "ses:ListIdentities",
                "ses:ListConfigurationSets",
                "sns:Subscribe",
                "sns:Publish",
                "s3:PutObject",
              ],
              resources: ["*"],
            }),
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: ["es:ESHttpHead", "es:ESHttpPost", "es:ESHttpGet"],
              resources: [`${openSearchDomainArn}/*`],
            }),
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: ["ec2:DescribeSecurityGroups", "ec2:DescribeVpcs"],
              resources: ["*"],
            }),
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: [
                "cognito-idp:ListUsers",
                "cognito-idp:AdminGetUser",
                "cognito-idp:AdminListUsers",
              ],
              resources: [
                `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/us-east-*`,
              ],
            }),
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: [
                "secretsmanager:DescribeSecret",
                "secretsmanager:GetSecretValue",
              ],
              resources: [
                `arn:aws:secretsmanager:${this.region}:${this.account}:secret:*`,
              ],
            }),
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: ["logs:CreateLogGroup"],
              resources: ["*"],
            }),
          ],
        }),
      },
    });

    // Create a DynamoDB table to track email send attempts
    const emailAttemptsTable = new dynamodb.Table(this, "EmailAttemptsTable", {
      partitionKey: { name: "emailId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    const processEmailsLambda = new NodejsFunction(
      this,
      "ProcessEmailsLambda",
      {
        depsLockFilePath: join(__dirname, "../../bun.lockb"),
        entry: join(__dirname, "../lambda/processEmails.ts"),
        handler: "handler",
        runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
        memorySize: 1024,
        timeout: cdk.Duration.minutes(15),
        role: lambdaRole,
        vpc: vpc,
        vpcSubnets: {
          subnets: privateSubnets,
        },
        logRetention: 30,
        securityGroups: [lambdaSecurityGroup],
        environment: {
          stage,
          indexNamespace,
          osDomain: `https://${openSearchDomainEndpoint}`,
          applicationEndpointUrl,
          emailAddressLookupSecretName,
          emailFromIdentity,
          EMAIL_ATTEMPTS_TABLE: emailAttemptsTable.tableName,
          MAX_RETRY_ATTEMPTS: "3", // Set the maximum number of retry attempts
          userPoolId,
          CONFIGURATION_SET: configurationSet.name!,
          REGION: cdk.Aws.REGION,
        },
      },
    );

    // Grant the Lambda function read/write permissions
    emailAttemptsTable.grantReadWriteData(processEmailsLambda);

    new CfnEventSourceMapping(this, "SinkEmailTrigger", {
      batchSize: 1,
      enabled: true,
      selfManagedEventSource: {
        endpoints: {
          kafkaBootstrapServers: brokerString.split(","),
        },
      },
      functionName: processEmailsLambda.functionName,
      sourceAccessConfigurations: [
        ...privateSubnets.map((subnet) => ({
          type: "VPC_SUBNET",
          uri: subnet.subnetId,
        })),
        {
          type: "VPC_SECURITY_GROUP",
          uri: `security_group:${lambdaSecurityGroupId}`,
        },
      ],
      startingPosition: "LATEST",
      topics: [`${topicNamespace}aws.onemac.migration.cdc`],
    });

    // Grant permissions to the Lambda function to send emails using SES
    processEmailsLambda.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ["ses:SendEmail", "ses:SendRawEmail"],
        resources: [
          `arn:aws:ses:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:identity/${emailIdentityDomain}`,
        ],
      }),
    );
  }
}
