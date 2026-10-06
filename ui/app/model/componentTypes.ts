/* eslint-disable noSecrets/no-secrets -- long Smartscape type names (AZURE_MICROSOFT_…) look random, but aren't secrets */

/**
 * Entity component types: one entry per kind of Smartscape entity a component can represent.
 * Every Smartscape type here was checked against real environments.
 */
export interface ComponentTypeDef {
  label: string;
  category: ComponentCategory;
  /** Smartscape node types listed by the entity picker (a trailing `*` matches a prefix). */
  smartscape: string[];
  /** Extra DQL filter applied to the nodes, e.g. to tell web from mobile frontends. */
  filter?: string;
  /** Default icon (export name from @dynatrace/strato-icons). */
  icon: string;
  /**
   * "endpoints": the picker lists service endpoints (from the request metrics) instead of Smartscape nodes; each pick
   * keeps its service id, so problems are those of the service.
   */
  listing?: "endpoints";
}

export const COMPONENT_CATEGORIES = ["Applications", "Synthetic", "Infrastructure", "Kubernetes", "AWS", "Azure", "Google Cloud"] as const;
export type ComponentCategory = (typeof COMPONENT_CATEGORIES)[number];

export const COMPONENT_TYPE_DEFS = {
  // Applications
  frontend: { label: "Frontend", category: "Applications", smartscape: ["FRONTEND"], filter: 'frontend.type == "web"', icon: "ApplicationsIcon" },
  mobile: { label: "Mobile", category: "Applications", smartscape: ["FRONTEND"], filter: 'frontend.type != "web"', icon: "MobileIcon" },
  service: { label: "Service", category: "Applications", smartscape: ["SERVICE"], icon: "ServicesIcon" },
  endpoint: { label: "Endpoint", category: "Applications", smartscape: ["SERVICE"], icon: "RequestIcon", listing: "endpoints" },
  process: { label: "Process", category: "Applications", smartscape: ["PROCESS"], icon: "ProcessIcon" },
  genai: { label: "GenAI", category: "Applications", smartscape: ["GENAI_SERVICE", "GENAI_AGENT", "GENAI_MODEL"], icon: "AIModelIcon" },
  // Synthetic monitors
  browserMonitor: { label: "Browser monitor", category: "Synthetic", smartscape: ["BROWSER_MONITOR"], icon: "DesktopIcon" },
  httpMonitor: { label: "HTTP monitor", category: "Synthetic", smartscape: ["HTTP_MONITOR"], icon: "HttpIcon" },
  networkMonitor: {
    label: "Network availability monitor",
    category: "Synthetic",
    smartscape: ["NETWORK_AVAILABILITY_MONITOR"],
    icon: "NetworkIcon",
  },
  // Infrastructure
  host: { label: "Host", category: "Infrastructure", smartscape: ["HOST"], icon: "HostsIcon" },
  container: { label: "Container", category: "Infrastructure", smartscape: ["CONTAINER"], icon: "ContainerIcon" },
  database: { label: "Database", category: "Infrastructure", smartscape: ["DB_INSTANCE_*", "DB_DATABASE_*"], icon: "DatabaseIcon" },
  networkDevice: { label: "Network device", category: "Infrastructure", smartscape: ["EXT_NETWORK_DEVICE"], icon: "NetworkDevicesIcon" },
  // Kubernetes
  k8sCluster: { label: "K8s cluster", category: "Kubernetes", smartscape: ["K8S_CLUSTER"], icon: "HexagonIcon" },
  k8sNamespace: { label: "K8s namespace", category: "Kubernetes", smartscape: ["K8S_NAMESPACE"], icon: "GroupIcon" },
  k8sNode: { label: "K8s node", category: "Kubernetes", smartscape: ["K8S_NODE"], icon: "NodeIcon" },
  workload: { label: "Workload", category: "Kubernetes", smartscape: ["K8S_DEPLOYMENT", "K8S_STATEFULSET", "K8S_DAEMONSET"], icon: "ContainerIcon" },
  k8sPod: { label: "K8s pod", category: "Kubernetes", smartscape: ["K8S_POD"], icon: "CellsIcon" },
  k8sService: { label: "K8s service", category: "Kubernetes", smartscape: ["K8S_SERVICE"], icon: "ConnectorIcon" },
  k8sIngress: { label: "K8s ingress", category: "Kubernetes", smartscape: ["K8S_INGRESS"], icon: "InternetIcon" },
  // AWS
  awsEc2: { label: "AWS EC2 instance", category: "AWS", smartscape: ["AWS_EC2_INSTANCE"], icon: "HostsIcon" },
  awsLambda: { label: "AWS Lambda", category: "AWS", smartscape: ["AWS_LAMBDA_FUNCTION"], icon: "CodeIcon" },
  awsEcs: { label: "AWS ECS service", category: "AWS", smartscape: ["AWS_ECS_SERVICE"], icon: "ContainerIcon" },
  awsEks: { label: "AWS EKS cluster", category: "AWS", smartscape: ["AWS_EKS_CLUSTER"], icon: "HexagonIcon" },
  awsRds: { label: "AWS RDS", category: "AWS", smartscape: ["AWS_RDS_DBINSTANCE", "AWS_RDS_DBCLUSTER"], icon: "DatabaseIcon" },
  awsDynamoDb: { label: "AWS DynamoDB", category: "AWS", smartscape: ["AWS_DYNAMODB_TABLE"], icon: "DatabaseIcon" },
  awsElastiCache: {
    label: "AWS ElastiCache",
    category: "AWS",
    smartscape: ["AWS_ELASTICACHE_CACHECLUSTER", "AWS_ELASTICACHE_REPLICATIONGROUP", "AWS_ELASTICACHE_SERVERLESSCACHE"],
    icon: "RAMIcon",
  },
  awsS3: { label: "AWS S3 bucket", category: "AWS", smartscape: ["AWS_S3_BUCKET"], icon: "StorageIcon" },
  awsSqs: { label: "AWS SQS queue", category: "AWS", smartscape: ["AWS_SQS_QUEUE"], icon: "QueuesIcon" },
  awsSns: { label: "AWS SNS topic", category: "AWS", smartscape: ["AWS_SNS_TOPIC"], icon: "QueuesIcon" },
  awsLoadBalancer: {
    label: "AWS load balancer",
    category: "AWS",
    smartscape: ["AWS_ELASTICLOADBALANCINGV2_LOADBALANCER", "AWS_ELASTICLOADBALANCING_LOADBALANCER"],
    icon: "DistributeIcon",
  },
  awsApiGateway: { label: "AWS API Gateway", category: "AWS", smartscape: ["AWS_APIGATEWAY_RESTAPI", "AWS_APIGATEWAYV2_API"], icon: "HttpIcon" },
  // Azure
  azureVm: { label: "Azure VM", category: "Azure", smartscape: ["AZURE_MICROSOFT_COMPUTE_VIRTUALMACHINES"], icon: "HostsIcon" },
  azureAppService: { label: "Azure App Service", category: "Azure", smartscape: ["AZURE_MICROSOFT_WEB_SITES"], icon: "AppsIcon" },
  azureFunction: { label: "Azure Function", category: "Azure", smartscape: ["AZURE_MICROSOFT_WEB_SITES_FUNCTIONS"], icon: "CodeIcon" },
  azureContainerApp: { label: "Azure Container App", category: "Azure", smartscape: ["AZURE_MICROSOFT_APP_CONTAINERAPPS"], icon: "ContainerIcon" },
  azureAks: { label: "Azure AKS cluster", category: "Azure", smartscape: ["AZURE_MICROSOFT_CONTAINERSERVICE_MANAGEDCLUSTERS"], icon: "HexagonIcon" },
  azureSql: { label: "Azure SQL database", category: "Azure", smartscape: ["AZURE_MICROSOFT_SQL_SERVERS_DATABASES"], icon: "DatabaseIcon" },
  azureCosmosDb: { label: "Azure Cosmos DB", category: "Azure", smartscape: ["AZURE_MICROSOFT_DOCUMENTDB_DATABASEACCOUNTS"], icon: "DatabaseIcon" },
  azureRedis: { label: "Azure Cache for Redis", category: "Azure", smartscape: ["AZURE_MICROSOFT_CACHE_REDIS"], icon: "RAMIcon" },
  azureStorage: { label: "Azure Storage account", category: "Azure", smartscape: ["AZURE_MICROSOFT_STORAGE_STORAGEACCOUNTS"], icon: "StorageIcon" },
  azureServiceBus: { label: "Azure Service Bus", category: "Azure", smartscape: ["AZURE_MICROSOFT_SERVICEBUS_NAMESPACES"], icon: "QueuesIcon" },
  azureEventHubs: { label: "Azure Event Hubs", category: "Azure", smartscape: ["AZURE_MICROSOFT_EVENTHUB_NAMESPACES"], icon: "QueuesIcon" },
  azureLoadBalancer: { label: "Azure load balancer", category: "Azure", smartscape: ["AZURE_MICROSOFT_NETWORK_LOADBALANCERS"], icon: "DistributeIcon" },
  azureAppGateway: { label: "Azure Application Gateway", category: "Azure", smartscape: ["AZURE_MICROSOFT_NETWORK_APPLICATIONGATEWAYS"], icon: "DistributeIcon" },
  azureApim: { label: "Azure API Management", category: "Azure", smartscape: ["AZURE_MICROSOFT_APIMANAGEMENT_SERVICE"], icon: "HttpIcon" },
  // Google Cloud
  gcpVm: { label: "GCP Compute Engine VM", category: "Google Cloud", smartscape: ["GCP_COMPUTE_GOOGLEAPIS_COM_INSTANCE"], icon: "HostsIcon" },
  gcpCloudRun: { label: "GCP Cloud Run service", category: "Google Cloud", smartscape: ["GCP_RUN_GOOGLEAPIS_COM_SERVICE"], icon: "ContainerIcon" },
  gcpPubSub: { label: "GCP Pub/Sub topic", category: "Google Cloud", smartscape: ["GCP_PUBSUB_GOOGLEAPIS_COM_TOPIC"], icon: "QueuesIcon" },
} satisfies Record<string, ComponentTypeDef>;

export type ComponentTypeId = keyof typeof COMPONENT_TYPE_DEFS;

export const COMPONENT_TYPE_IDS = Object.keys(COMPONENT_TYPE_DEFS) as [ComponentTypeId, ...ComponentTypeId[]];

export function componentTypeDef(type: ComponentTypeId): ComponentTypeDef {
  return COMPONENT_TYPE_DEFS[type];
}

/** Case-insensitive match on the label, the category and the Smartscape types (palette and type filters). */
export function matchesComponentType(type: ComponentTypeId, text: string): boolean {
  const q = text.trim().toLowerCase();
  if (!q) {
    return true;
  }
  const def: ComponentTypeDef = COMPONENT_TYPE_DEFS[type];
  return [def.label, def.category, ...def.smartscape].some((s) => s.toLowerCase().includes(q));
}
