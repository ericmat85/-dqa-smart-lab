import {createContext,useContext} from 'react';
export const WorkspaceImagesContext=createContext(null);
export const useWorkspaceImages=()=>useContext(WorkspaceImagesContext);
