Setting up an Amazon RDS instance is just the first step. Before any application or developer can use it, you need to understand the three layers that govern access — the network path, the security group rules, and the credentials themselves. Get any one of them wrong and the connection silently fails with a timeout.

This post covers everything in the official AWS connectivity documentation: endpoints and ports, the MySQL CLI, MySQL Workbench, application drivers, and a structured approach to troubleshooting.

---

## The Endpoint: Your Database's Address

RDS never exposes a static IP address. It exposes a **DNS endpoint** — a hostname that always resolves to the correct instance, including after a failover event.

```sh
  ┌──────────────┐
  │  Application │
  └──────┬───────┘
         │  Connects to:
         │  mydb.cxyz123abc.eu-west-1.rds.amazonaws.com:3306
         ▼
  ┌────────────────────────────────────┐
  │  AWS DNS Resolver                  │
  │  (Route 53 private hosted zone)    │
  └──────────────┬─────────────────────┘
                 │
       ┌─────────┴──────────┐
       ▼                    ▼
  ┌──────────┐        ┌──────────────┐
  │ Primary  │        │ Standby (AZ2)│
  │ DB (AZ1) │        │ (Failover)   │
  └──────────┘        └──────────────┘
```

During a failover, AWS promotes the standby and updates the DNS record. Your application reconnects to the same hostname and lands on the new primary — no configuration change needed.

### Finding Your Endpoint

In the RDS console: **Databases → [your instance] → Connectivity & security → Endpoint**.

Via the AWS CLI:

```sh
aws rds describe-db-instances \
  --db-instance-identifier mydb \
  --query 'DBInstances[0].Endpoint'
```

Output:

```json
{
  "Address": "mydb.cxyz123abc.eu-west-1.rds.amazonaws.com",
  "Port": 3306,
  "HostedZoneId": "Z29TKCIE4G7QVZ"
}
```

### Default Port

MySQL on RDS uses port **3306** by default. You can change it at instance creation time, but this is rarely necessary and adds operational complexity without security benefit (security groups are the right access control mechanism).

---

## The Three Layers of Connectivity

Every failed RDS connection traces back to one of these three layers:

```sh
  ┌──────────────────────────────────────────────────────┐
  │                                                      │
  │  LAYER 1: NETWORK PATH                               │
  │  ─────────────────────────────────────────────────   │
  │  Is the instance in a public subnet with an IGW?     │
  │  If private: do you have VPN / VPC Peering /         │
  │              Bastion Host / RDS Proxy?               │
  │                                                      │
  │  LAYER 2: SECURITY GROUP                             │
  │  ─────────────────────────────────────────────────   │
  │  Does the RDS Security Group allow inbound TCP 3306  │
  │  from your IP or your app's Security Group?          │
  │                                                      │
  │  LAYER 3: CREDENTIALS                                │
  │  ─────────────────────────────────────────────────   │
  │  Valid username + password,  OR  IAM auth token?     │
  │  Does the DB user have the right privileges?         │
  │                                                      │
  └──────────────────────────────────────────────────────┘
```

All three layers must pass before a connection succeeds. A failure in Layer 1 looks identical to a failure in Layer 2 from the client perspective — both produce a timeout or "Can't connect" error.

---

## Prerequisite: Install the MySQL Client

Before connecting from a terminal, the MySQL client must be installed. RDS does not bundle or require a specific version, but the client must be compatible with the server version you are running.

### macOS

```sh
brew install mysql-client

# Add to PATH (Apple Silicon)
echo 'export PATH="/opt/homebrew/opt/mysql-client/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### Linux (Amazon Linux 2 / RHEL-based)

```sh
sudo dnf install mariadb105   # Amazon Linux 2023
# or
sudo yum install mysql        # Amazon Linux 2
```

### Linux (Debian / Ubuntu)

```sh
sudo apt-get update
sudo apt-get install mysql-client
```

### Verify

```sh
mysql --version
# mysql  Ver 8.0.x  Distrib 8.0.x, for ...
```

---

## Connecting via the MySQL CLI

### Basic Connection

```sh
mysql \
  --host=mydb.cxyz123abc.eu-west-1.rds.amazonaws.com \
  --port=3306 \
  --user=admin \
  --password
```

You will be prompted for the password. Avoid passing it as `--password=mypassword` on the command line — it appears in shell history and in `ps aux`.

### SSL/TLS (Recommended)

RDS requires SSL by default for MySQL 8.0 instances. To connect with the AWS Certificate Bundle:

```sh
# Download the regional certificate bundle
curl -o rds-combined-ca-bundle.pem \
  https://truststore.pki.rds.amazonaws.com/eu-west-1/eu-west-1-bundle.pem

# Connect with SSL
mysql \
  --host=mydb.cxyz123abc.eu-west-1.rds.amazonaws.com \
  --port=3306 \
  --user=admin \
  --password \
  --ssl-ca=rds-combined-ca-bundle.pem \
  --ssl-mode=VERIFY_IDENTITY
```

The `--ssl-mode=VERIFY_IDENTITY` flag ensures the certificate's hostname matches the endpoint — preventing man-in-the-middle attacks.

### Verify SSL is Active

```sql
mysql> SHOW STATUS LIKE 'Ssl_cipher';
+---------------+---------------------------+
| Variable_name | Value                     |
+---------------+---------------------------+
| Ssl_cipher    | TLS_AES_256_GCM_SHA384    |
+---------------+---------------------------+
```

An empty value means the connection is unencrypted.

### IAM Database Authentication (Password-Free)

RDS supports IAM authentication, where a short-lived token replaces the password. This is useful when you want to avoid storing credentials and are running from EC2 or Lambda with an IAM role.

```sh
# Generate the auth token (valid for 15 minutes)
TOKEN=$(aws rds generate-db-auth-token \
  --hostname mydb.cxyz123abc.eu-west-1.rds.amazonaws.com \
  --port 3306 \
  --username iam_user \
  --region eu-west-1)

# Connect using the token as password
mysql \
  --host=mydb.cxyz123abc.eu-west-1.rds.amazonaws.com \
  --port=3306 \
  --user=iam_user \
  --password="$TOKEN" \
  --ssl-ca=rds-combined-ca-bundle.pem \
  --ssl-mode=VERIFY_IDENTITY
```

IAM auth requires: the feature enabled on the instance, the DB user granted `AWSAuthenticationPlugin`, and the IAM role/user having `rds-db:connect` permission.

---

## Connecting via MySQL Workbench

MySQL Workbench provides a GUI for connecting to and managing RDS instances.

```sh
  ┌──────────────────────────────────────────────────────────┐
  │  New Connection                                          │
  │  ──────────────────────────────────────────────────────  │
  │  Connection Method:  Standard (TCP/IP)                   │
  │                                                          │
  │  Hostname:   mydb.cxyz123abc.eu-west-1.rds.amazonaws.com │
  │  Port:       3306                                        │
  │  Username:   admin                                       │
  │  Password:   [Store in Keychain...]                      │
  │  Default Schema: (optional — leave blank for all)        │
  │  ──────────────────────────────────────────────────────  │
  │  SSL tab:                                                │
  │  Use SSL:      Require                                   │
  │  SSL CA File:  /path/to/rds-combined-ca-bundle.pem       │
  └──────────────────────────────────────────────────────────┘
```

### Connecting via SSH Tunnel (Bastion Host)

If your RDS instance is in a **private subnet** (the recommended production configuration), you cannot connect to it directly from your laptop. The standard approach is an SSH tunnel through a Bastion Host.

```sh
  Your Laptop
  ──────────────────────────────────────────────────────────
  ┌─────────────┐                    ┌───────────────────┐
  │  MySQL      │   SSH Tunnel       │  Bastion Host     │
  │  Workbench  │ ─────────────────► │  (public subnet)  │
  │  localhost: │   port 3306        │  EC2, port 22     │
  │  3306       │                    └────────┬──────────┘
  └─────────────┘                             │  Internal VPC
                                              │  TCP 3306
                                             ▼
                                    ┌───────────────────┐
                                    │  RDS Instance     │
                                    │  (private subnet) │
                                    └───────────────────┘
```

In MySQL Workbench, select **Connection Method: Standard TCP/IP over SSH**:

```sh
  SSH Hostname:       bastion.example.com:22
  SSH Username:       ec2-user
  SSH Key File:       /path/to/bastion-key.pem
  MySQL Hostname:     mydb.cxyz123abc.eu-west-1.rds.amazonaws.com
  MySQL Port:         3306
  MySQL Username:     admin
```

Alternatively, open the tunnel manually and connect Workbench to `localhost`:

```sh
ssh -N -L 3306:mydb.cxyz123abc.eu-west-1.rds.amazonaws.com:3306 \
  -i bastion-key.pem \
  ec2-user@bastion.example.com
```

Then in Workbench: `Hostname: 127.0.0.1`, `Port: 3306`.

---

## Connecting from Application Code

### Python (mysql-connector-python)

```python
import mysql.connector

conn = mysql.connector.connect(
    host="mydb.cxyz123abc.eu-west-1.rds.amazonaws.com",
    port=3306,
    user="app_user",
    password="your_password",
    database="myapp",
    ssl_ca="/path/to/rds-combined-ca-bundle.pem",
    ssl_verify_cert=True,
)
```

### Python (PyMySQL)

```python
import pymysql

conn = pymysql.connect(
    host="mydb.cxyz123abc.eu-west-1.rds.amazonaws.com",
    port=3306,
    user="app_user",
    password="your_password",
    database="myapp",
    ssl={"ca": "/path/to/rds-combined-ca-bundle.pem"},
)
```

### Node.js (mysql2)

```javascript
const mysql = require('mysql2');
const fs = require('fs');

const connection = mysql.createConnection({
  host: 'mydb.cxyz123abc.eu-west-1.rds.amazonaws.com',
  port: 3306,
  user: 'app_user',
  password: 'your_password',
  database: 'myapp',
  ssl: {
    ca: fs.readFileSync('/path/to/rds-combined-ca-bundle.pem'),
  },
});
```

### Java (JDBC)

```java
String url = "jdbc:mysql://mydb.cxyz123abc.eu-west-1.rds.amazonaws.com:3306/myapp"
           + "?sslMode=VERIFY_IDENTITY"
           + "&trustCertificateKeyStoreUrl=file:/path/to/truststore.jks"
           + "&trustCertificateKeyStorePassword=changeit";

Connection conn = DriverManager.getConnection(url, "app_user", "your_password");
```

### RDS Proxy (Recommended for Lambda / Short-Lived Connections)

Lambda functions open and close connections on every invocation. This exhausts the RDS connection pool rapidly. **RDS Proxy** sits between your application and RDS, multiplexing connections:

```sh
  ┌──────────────────────────────────────────────────────────┐
  │                                                          │
  │  Lambda fn 1 ──┐                                         │
  │  Lambda fn 2 ──┤                                         │
  │  Lambda fn 3 ──┼──► RDS Proxy ──► RDS Instance           │
  │  Lambda fn 4 ──┤    (connection  (5 long-lived           │
  │  Lambda fn 5 ──┘     pooling)     connections)           │
  │                                                          │
  │  500 Lambda invocations → 5 DB connections               │
  │                                                          │
  └──────────────────────────────────────────────────────────┘
```

The application connects to the RDS Proxy endpoint instead of the RDS endpoint directly. No code change needed beyond the hostname.

---

## Troubleshooting Connection Failures

### Structured Diagnostic Flow

```sh
  ┌──────────────────────────────────────────┐
  │  ERROR 2003: Can't connect to MySQL      │
  │  server on '...' (Connection timed out)  │
  └──────────────────┬───────────────────────┘
                     │
                     ▼
  ┌──────────────────────────────────────────┐
  │  Step 1: Can you reach the port?         │
  │  nc -zv <endpoint> 3306                  │
  └──────────┬───────────────────────────────┘
             │
     ┌───────┴───────┐
     ▼ No            ▼ Yes
     │               │
  Network         Port open —
  blocked         go to Step 2
     │
     ├── Is the instance Publicly Accessible?
     │   Check: RDS console → Connectivity & security
     │   Fix:   Modify instance → enable Public accessibility
     │          (only for dev — not recommended for prod)
     │
     ├── Security Group inbound rule for TCP 3306?
     │   Check: EC2 → Security Groups → Inbound rules
     │   Fix:   Add rule — Type: MySQL/Aurora, Source: your IP
     │
     └── If private subnet: VPC routing / Bastion / VPN?
         Check: VPC → Route Tables → subnet association
         Fix:   Add Bastion Host or VPN connection

                     │
                     ▼
  ┌──────────────────────────────────────────┐
  │  Step 2: Port open but auth fails?       │
  │  ERROR 1045: Access denied               │
  └──────────┬───────────────────────────────┘
             │
     ├── Wrong username or password?
     │   Fix: Reset master password in RDS console
     │        Databases → Modify → New master password
     │
     ├── Wrong database name in connection string?
     │   Fix: Omit DB name and list available ones:
     │        mysql> SHOW DATABASES;
     │
     └── IAM auth mismatch?
         Fix: Confirm DB user has AWSAuthenticationPlugin
              SHOW CREATE USER 'iam_user'@'%';

                     │
                     ▼
  ┌──────────────────────────────────────────┐
  │  Step 3: SSL/TLS errors?                 │
  │  ERROR 2026: SSL connection error        │
  └──────────┬───────────────────────────────┘
             │
     ├── Certificate bundle missing or wrong region?
     │   Fix: Download the correct regional bundle
     │        https://truststore.pki.rds.amazonaws.com
     │        /<region>/<region>-bundle.pem
     │
     └── Server requires SSL but client doesn't use it?
         Fix: Add --ssl-mode=REQUIRED (or VERIFY_IDENTITY)
              Check: SELECT @@require_secure_transport;
```

### Instance Not Publicly Accessible

If the instance was created with **Public accessibility: No** (the default for production), you cannot connect from outside the VPC without a Bastion, VPN, or RDS Proxy. Enabling public accessibility is appropriate only for development instances and should never be used for production databases containing real data.

### Security Group: Least-Privilege Rules

```sh
  BAD (never do this)
  ──────────────────────────────────────────
  Inbound: TCP 3306, Source: 0.0.0.0/0
  Allows any IP on the internet to attempt connections.

  GOOD: App on EC2 / ECS / Lambda
  ──────────────────────────────────────────
  Inbound: TCP 3306, Source: sg-0abc123 (app security group)
  Only resources in the app SG can connect.

  GOOD: Developer access
  ──────────────────────────────────────────
  Inbound: TCP 3306, Source: 203.0.113.45/32 (specific IP)
  Only that IP can connect. Update when IP changes.

  BEST: No direct internet access (production)
  ──────────────────────────────────────────
  No public inbound rule at all.
  Access via Bastion Host or AWS Systems Manager Session Manager.
```

### Common Error Reference

| Error | Most likely cause | First check |
|---|---|---|
| `ERROR 2003 (HY000): Can't connect` + timeout | Layer 1 or 2 — network or security group | `nc -zv <endpoint> 3306` |
| `ERROR 2003 (HY000): Can't connect` + refused | Instance stopped or wrong port | RDS console → instance status |
| `ERROR 1045 (28000): Access denied` | Wrong username/password or missing DB user | Reset master password, check user exists |
| `ERROR 2026 (HY000): SSL connection error` | Certificate mismatch or SSL mode conflict | Download fresh regional cert bundle |
| `ERROR 1049 (42000): Unknown database` | DB name in connection string doesn't exist | `SHOW DATABASES;` on a clean connection |
| Connection timeout after upgrade | Auth plugin changed (5.7 → 8.0) | Check driver version supports `caching_sha2_password` |

---

## Summary

RDS MySQL connectivity is a three-layer problem: the network path must exist, the security group must allow the traffic, and the credentials must be valid. Any single layer can silently block a connection.

Key points:

- **Always connect via the DNS endpoint**, never a static IP
- **SSL is required** on MySQL 8.0 — download the regional certificate bundle and use `VERIFY_IDENTITY`
- **Private subnets are correct for production** — use a Bastion Host, VPN, or RDS Proxy for access
- **Security groups, not `0.0.0.0/0`** — authorise the specific source security group or IP
- **IAM authentication** is the cleanest credential model for EC2 and Lambda workloads
- **RDS Proxy** is the right answer for Lambda and other short-lived connection patterns
- **When troubleshooting**: test the port first (`nc -zv`), then credentials, then SSL — in that order
