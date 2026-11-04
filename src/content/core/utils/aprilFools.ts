export const isAprilFools = (days?: number) => new Date().getMonth() === 3 && new Date().getDate() <= (days !== undefined ? (days < 30 ? days : 30) : 14);
