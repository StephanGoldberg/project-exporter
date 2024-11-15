export interface FileData {
    path: string;
    content: string;
    language?: string;
    size: number;
    lastModified: Date;
}