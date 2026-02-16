#!/bin/bash

# Komari Theme Commander Build Script
# This script builds the theme package locally

set -e  # Exit on any error

echo "Building Komari Theme Commander Package..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${NC} $1"
}

print_success() {
    echo -e "${GREEN} $1${NC}"
}

print_warning() {
    echo -e "${YELLOW} $1${NC}"
}

print_error() {
    echo -e "${RED}[ERROR] $1${NC}"
}

# Check if required commands exist
check_dependencies() {
    print_status "Checking dependencies..."

    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        exit 1
    fi

    if ! command -v pnpm &> /dev/null; then
        print_error "pnpm is not installed"
        exit 1
    fi

    if ! command -v zip &> /dev/null; then
        print_error "zip is not installed"
        exit 1
    fi

    print_success "All dependencies are available"
}

# Install dependencies
install_dependencies() {
    print_status "Installing dependencies..."
    pnpm install
    print_success "Dependencies installed"
}

# Build the project
build_project() {
    print_status "Building project..."
    pnpm run build
    print_success "Project built successfully"
}

# Update theme configuration
update_theme_config() {
    print_status "Updating theme configuration..."

    # Read version from package.json
    VERSION=$(node -p "require('./package.json').version")

    if [ -z "$VERSION" ]; then
        print_error "Failed to read version from package.json"
        exit 1
    fi

    # Update version in komari-theme.json
    node -e "
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('komari-theme.json', 'utf8'));
config.version = '${VERSION}';
fs.writeFileSync('komari-theme.json', JSON.stringify(config, null, 4) + '\n');
"

    print_success "Updated komari-theme.json version to ${VERSION}"
}

# Verify required files exist
verify_files() {
    print_status "Verifying required files..."

    local files_missing=false

    if [ ! -f "preview.png" ]; then
        print_error "preview.png not found"
        files_missing=true
    fi

    if [ ! -f "komari-theme.json" ]; then
        print_error "komari-theme.json not found"
        files_missing=true
    fi

    if [ ! -d "dist" ]; then
        print_error "dist/ directory not found"
        files_missing=true
    fi

    if [ "$files_missing" = true ]; then
        print_error "Some required files are missing"
        exit 1
    fi

    print_success "All required files found!"
}

# Create theme package
create_package() {
    print_status "Creating theme package..."

    # Read version from package.json
    VERSION=$(node -p "require('./package.json').version")

    # Create a temporary directory for the package
    rm -rf theme-package
    mkdir -p theme-package

    # Copy required files
    cp preview.png theme-package/
    cp komari-theme.json theme-package/
    cp -r dist/ theme-package/

    # Create zip file with version
    ZIP_NAME="komari-theme-commander@${VERSION}.zip"

    cd theme-package
    zip -r "../dist/${ZIP_NAME}" .
    cd ..

    # Clean up
    rm -rf theme-package

    print_success "Created package: ${ZIP_NAME}"
    ls -la "dist/${ZIP_NAME}"
}

# Main execution
main() {
    # Ensure we run from the project root
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    cd "$SCRIPT_DIR/.."

    echo "======================================"
    echo "  Komari Theme Commander Package Builder"
    echo "======================================"
    echo

    check_dependencies
    echo

    install_dependencies
    echo

    build_project
    echo

    update_theme_config
    echo

    verify_files
    echo

    create_package
    echo

    print_success "Theme package build completed! 🎉"
    echo
    echo "You can now use the generated zip file as a theme package."
}

# Run main function
main "$@"
