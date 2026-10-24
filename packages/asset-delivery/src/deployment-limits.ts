/** Combined deployment budget, measured both before and after compression. */
export const maxDeploymentBytes = 10 * 1024 * 1024;

export const maxStaticAssets = 256;

export const assertDeploymentSize = (assetSizes: readonly number[]) => {
  const total = assetSizes.reduce((bytes, size) => bytes + size, 0);

  if (total > maxDeploymentBytes) {
    throw new Error(
      `Combined deployment assets cannot exceed ${maxDeploymentBytes} bytes before or after compression.`
    );
  }
};
