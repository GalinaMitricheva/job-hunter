import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Profile
  getProfile: () => ipcRenderer.invoke('profile:get'),
  saveBasicProfile: (data: any) => ipcRenderer.invoke('profile:save-basic', data),
  completeOnboarding: () => ipcRenderer.invoke('profile:complete-onboarding'),
  saveWorkExperience: (item: any) => ipcRenderer.invoke('work-experience:save', item),
  deleteWorkExperience: (id: number) => ipcRenderer.invoke('work-experience:delete', id),
  saveEducation: (item: any) => ipcRenderer.invoke('education:save', item),
  deleteEducation: (id: number) => ipcRenderer.invoke('education:delete', id),
  saveSkill: (item: any) => ipcRenderer.invoke('skills:save', item),
  deleteSkill: (id: number) => ipcRenderer.invoke('skills:delete', id),
  saveCertification: (item: any) => ipcRenderer.invoke('certifications:save', item),
  deleteCertification: (id: number) => ipcRenderer.invoke('certifications:delete', id),
  savePreferences: (data: any) => ipcRenderer.invoke('preferences:save', data),

  // Search
  runSearch: () => ipcRenderer.invoke('search:run'),
  getSearchResults: (params?: any) => ipcRenderer.invoke('search:results', params),
  updateJobStatus: (id: number, status: string) => ipcRenderer.invoke('search:update-status', { id, status }),
  getSearchHistory: () => ipcRenderer.invoke('search:history'),
  getNextRunTime: () => ipcRenderer.invoke('search:next-run'),
  exportSearchCSV: () => ipcRenderer.invoke('search:export-csv'),

  // Queue & Applications
  addToQueue: (jobResultId: number) => ipcRenderer.invoke('queue:add', jobResultId),
  getQueue: () => ipcRenderer.invoke('queue:get'),
  getQueueDetail: (applicationId: number) => ipcRenderer.invoke('queue:get-detail', applicationId),
  getCvHtml: (applicationId: number) => ipcRenderer.invoke('queue:get-cv-html', applicationId),
  approveApplication: (applicationId: number) => ipcRenderer.invoke('queue:approve', applicationId),
  skipApplication: (applicationId: number) => ipcRenderer.invoke('queue:skip', applicationId),
  saveDraft: (applicationId: number) => ipcRenderer.invoke('queue:save-draft', applicationId),
  updateCoverLetter: (applicationId: number, coverLetter: string) => ipcRenderer.invoke('queue:update-cover-letter', { applicationId, coverLetter }),
  regenerateCV: (applicationId: number) => ipcRenderer.invoke('queue:regenerate-cv', applicationId),
  getApplicationHistory: (params?: any) => ipcRenderer.invoke('applications:history', params),
  updateApplicationStatus: (id: number, applicationStatus: string) => ipcRenderer.invoke('applications:update-status', { id, applicationStatus }),
  exportCSV: () => ipcRenderer.invoke('applications:export-csv'),
  getStats: () => ipcRenderer.invoke('applications:get-stats'),
  openFile: (filePath: string) => ipcRenderer.invoke('shell:open-file', filePath),
  getProfileCompleteness: () => ipcRenderer.invoke('profile:completeness'),

  // Settings & Ollama
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (data: any) => ipcRenderer.invoke('settings:save', data),
  saveLinkedInCredentials: (email: string, password: string) => ipcRenderer.invoke('settings:save-linkedin', { email, password }),
  clearLinkedInCredentials: () => ipcRenderer.invoke('settings:clear-linkedin'),
  checkOllama: () => ipcRenderer.invoke('ollama:check'),
  getOllamaModels: () => ipcRenderer.invoke('ollama:models'),
  backupData: () => ipcRenderer.invoke('settings:backup'),
  restoreData: () => ipcRenderer.invoke('settings:restore'),
  openDataFolder: () => ipcRenderer.invoke('settings:open-data-folder'),
  getDataPath: () => ipcRenderer.invoke('settings:get-data-path'),

  // Events from main → renderer
  onSearchStarted: (cb: () => void) => ipcRenderer.on('search:started', cb),
  onSearchCompleted: (cb: (result: any) => void) => ipcRenderer.on('search:completed', (_, r) => cb(r)),
  onTriggerSearch: (cb: () => void) => ipcRenderer.on('trigger:search', cb),
  onQueueCountUpdated: (cb: (count: number) => void) => ipcRenderer.on('queue:count-updated', (_, c) => cb(c)),
  onSettingsSaved: (cb: () => void) => ipcRenderer.on('settings:saved', cb),
  offSettingsSaved: (cb: () => void) => ipcRenderer.removeListener('settings:saved', cb),
  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel)
}

contextBridge.exposeInMainWorld('electron', api)

export type ElectronAPI = typeof api
