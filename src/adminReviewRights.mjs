// Only authenticated workspace administrators receive combined acceptance rights.
export const isWorkspaceReviewer = account => !!(account?.id && account.status === '啟用中' && account.businessIdentity === true && account.businessAdmin === true);
