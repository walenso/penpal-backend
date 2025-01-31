#!/bin/bash
# backend/scripts/manage-ssm.sh

# Function to set SSM parameter
set_parameter() {
    local name=$1
    local value=$2
    local env=$3
    
    aws ssm put-parameter \
        --name "/$name_$env" \
        --type "SecureString" \
        --value "$value" \
        --overwrite

    if [ $? -eq 0 ]; then
        echo "Successfully set parameter $name for $env environment"
    else
        echo "Failed to set parameter $name for $env environment"
    fi
}

# Function to get SSM parameter
get_parameter() {
    local name=$1
    local env=$2
    
    aws ssm get-parameter \
        --name "/$name_$env" \
        --with-decryption \
        --query "Parameter.Value" \
        --output text
}

# Main script
case "$1" in
    "set")
        if [ -z "$2" ] || [ -z "$3" ] || [ -z "$4" ]; then
            echo "Usage: $0 set PARAMETER_NAME PARAMETER_VALUE ENVIRONMENT"
            exit 1
        fi
        set_parameter $2 $3 $4
        ;;
    "get")
        if [ -z "$2" ] || [ -z "$3" ]; then
            echo "Usage: $0 get PARAMETER_NAME ENVIRONMENT"
            exit 1
        fi
        get_parameter $2 $3
        ;;
    *)
        echo "Usage: $0 {set|get} PARAMETER_NAME [PARAMETER_VALUE] ENVIRONMENT"
        exit 1
        ;;
esac