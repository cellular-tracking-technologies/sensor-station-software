# Host-side build driver for the native C++ tools. Run from native/ in a Linux
# shell (WSL/Ubuntu) or via build.ps1 on Windows. Docker for the arm build.
#
#   make arm      reproducible armhf binaries -> build-arm/  (ctt-radio-driver, ctt-board-detect)
#   make native   local x86 build for fast compile-checks (NOT deployable)
#   make shell    interactive shell in the build container
#   make clean    remove build trees

IMAGE  ?= sensor-station-native-build
DOCKER ?= docker

RUN = $(DOCKER) run --rm -u $$(id -u):$$(id -g) -v "$(CURDIR)":/src -w /src $(IMAGE)

.PHONY: help image arm native test shell clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-8s\033[0m %s\n", $$1, $$2}'

image: ## Build the pinned cross-build docker image
	$(DOCKER) build -t $(IMAGE) -f docker/build.Dockerfile docker

arm: image ## Cross-compile the deployable armhf binaries
	$(RUN) cmake -S . -B build-arm -DCMAKE_TOOLCHAIN_FILE=cmake/toolchain-armhf-linux.cmake -DCMAKE_BUILD_TYPE=Release
	$(RUN) cmake --build build-arm -j
	$(RUN) sh -c 'file build-arm/ctt-* 2>/dev/null || true'

native: ## Local x86 build (dev / compile-check only)
	cmake -S . -B build-native -DCMAKE_BUILD_TYPE=Debug
	cmake --build build-native -j

test: native ## Build + run the native unit tests (x86)
	ctest --test-dir build-native --output-on-failure

shell: image ## Interactive shell in the build container
	$(DOCKER) run --rm -it -v "$(CURDIR)":/src -w /src $(IMAGE) bash

clean: ## Remove build trees
	rm -rf build build-native build-arm
