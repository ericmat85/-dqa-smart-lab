import {createContext,useContext} from 'react';
export const WorkspaceAppearanceContext=createContext(null);
export function useWorkspaceAppearance(){const value=useContext(WorkspaceAppearanceContext);if(!value)throw Error('WorkspaceAppearanceProvider is required');return value;}
