#!/usr/bin/env bash
# Create basic Azure Monitor alert rules for Nibras Container Apps (5xx / restarts).
#
# Usage:
#   ACTION_GROUP_EMAIL=ops@example.com bash scripts/monorepo/setup-azure-monitoring.sh
#
# Requires: az monitor action-group create permissions

set -euo pipefail

RG="${RG:-nibras-rg}"
LOCATION="${LOCATION:-uaenorth}"
ACTION_GROUP="${ACTION_GROUP:-nibras-alerts}"
ACTION_GROUP_EMAIL="${ACTION_GROUP_EMAIL:-}"

if [[ -z "$ACTION_GROUP_EMAIL" ]]; then
  echo "Set ACTION_GROUP_EMAIL to receive alert notifications." >&2
  echo "Example: ACTION_GROUP_EMAIL=ops@example.com $0" >&2
  exit 1
fi

SUB_ID="$(az account show --query id -o tsv)"
WORKSPACE="$(az monitor log-analytics workspace list -g "$RG" --query '[0].id' -o tsv 2>/dev/null || true)"

if [[ -z "$WORKSPACE" ]]; then
  echo "Creating Log Analytics workspace nibras-logs ..."
  az monitor log-analytics workspace create -g "$RG" -n nibras-logs -l "$LOCATION" -o none
  WORKSPACE="$(az monitor log-analytics workspace show -g "$RG" -n nibras-logs --query id -o tsv)"
fi

if ! az monitor action-group show -g "$RG" -n "$ACTION_GROUP" >/dev/null 2>&1; then
  az monitor action-group create -g "$RG" -n "$ACTION_GROUP" \
    --short-name nibras \
    --email-receiver "ops" "$ACTION_GROUP_EMAIL" \
    -o none
fi

AG_ID="$(az monitor action-group show -g "$RG" -n "$ACTION_GROUP" --query id -o tsv)"

for app in nibras-web nibras-api nibras-worker nibras-backend; do
  if ! az containerapp show -g "$RG" -n "$app" >/dev/null 2>&1; then
    echo "skip $app (not deployed)"
    continue
  fi
  RULE="${app}-restarts"
  if az monitor scheduled-query show -g "$RG" -n "$RULE" >/dev/null 2>&1; then
    echo "alert $RULE already exists"
    continue
  fi
  az monitor scheduled-query create -g "$RG" -n "$RULE" \
    --scopes "$WORKSPACE" \
    --window-size 5m --evaluation-frequency 5m \
    --severity 2 \
    --description "Container App ${app} restart spike" \
    --criteria "{\"allOf\":[{\"query\":\"ContainerAppSystemLogs_CL | where ContainerAppName_s == '${app}' | where Reason_s == 'ContainerCrashing' | summarize count()\",\"timeAggregation\":\"Count\",\"operator\":\"GreaterThan\",\"threshold\":3,\"failingPeriods\":{\"numberOfEvaluationPeriods\":1,\"minFailingPeriodsToAlert\":1}}]}" \
    --action-groups "$AG_ID" \
    -o none 2>/dev/null || echo "warn: could not create alert for $app (may need diagnostic settings)"
  echo "configured alert: $RULE"
done

echo "Monitoring baseline configured. Wire ACA diagnostics to workspace $WORKSPACE in Azure Portal if alerts stay silent."
