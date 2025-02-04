# Not to forget

## How to configure ECS Exec

> Taken from [here](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-exec.html#ecs-exec-prerequisites).

Before you start using ECS Exec, make sure that you have completed these actions:

1. Install and configure the AWS CLI. For more information, see Get started with the AWS CLI.
2. Install Session Manager plugin for the AWS CLI. For more information, see [Install the Session Manager plugin for the AWS CLI](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html).
3. You must use a task role with the [appropriate permissions](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html#ecs-exec-required-iam-permissions) for ECS Exec. Basically you need to:
   1. Assign permission to existing or new policy.
   2. Assign policy to task (can do it by adding `taskRoleArn` attribute in task *.json)
4. ECS Exec has version requirements depending on whether your tasks are hosted on Amazon EC2 or AWS Fargate (for Fargate it should be 1.4.0 or higher)
5. You need to update service. Run this: `aws ecs update-service --cluster envault-api --service envault-api --force-new-deployment --enable-execute-command`
6. To enter shell you need to run this: `aws ecs execute-command --cluster envault-api --task arn:aws:ecs:eu-north-1:713881789926:task/envault-api/b7a233f2b1564b5a8fd234b9cf1e5c08 --container envault-api --interactive --command "/bin/sh"`
> Damn alpine doesn't have bash, so add this to Docker file:
```
RUN apk add --no-cache bash curl
```
  
## How to configure EC2

1. Install docker and docker compose
2. Add to GitHub secrets:
   1. DOCKER_HUB_TOKEN
   2. DOCKER_HUB_USERNAME
   3. EC2_HOST
   4. EC2_USER
   5. EC2_SSH_KEY (private key)
3. Add EC2 public key (generate it from private key) to `~/.ssh/authorized_keys`. This is required for GitHub to be able to access EC2 via ssh
4. Generate new ssh key on EC2 and add public key to GitHub Deploy Keys. This is required for EC2 to clone the repo
5. Clone repo
6. Copy `.env` file to repo root
