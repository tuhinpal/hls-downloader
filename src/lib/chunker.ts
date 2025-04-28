const createChunk = <T>(data: T[], chunkSize: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < data.length; i += chunkSize) {
    chunks.push(data.slice(i, i + chunkSize));
  }
  return chunks;
};

export default createChunk;
