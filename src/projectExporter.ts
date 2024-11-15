// src/projectExporter.ts

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FileData } from './types';

type ExportFormat = 'Markdown' | 'JSON' | 'Text';
type QuickExportFormat = 'Markdown' | 'Text';

export class ProjectExporter {
    private readonly defaultIgnore = [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/.next/**',
        '**/coverage/**',
        '**/.vscode/**',
        '**/.idea/**',
        '**/out/**',
        '**/bin/**',
        '**/*.lock',
        '**/.DS_Store',
        '**/*.log',
        '**/*.map',
        '**/*.min.js',
        '**/*.min.css',
        '**/vendor/**',
        '**/public/assets/**',
        '**/.cache/**'
    ];

    private readonly binaryExtensions = [
        '.jpg', '.jpeg', '.png', '.gif', '.ico', '.pdf',
        '.exe', '.dll', '.so', '.dylib', '.bin',
        '.zip', '.tar', '.gz', '.7z', '.rar',
        '.woff', '.woff2', '.ttf', '.eot',
        '.mp3', '.mp4', '.avi', '.mov',
        '.sqlite', '.db', '.dat'
    ];

    private readonly languageMap: { [key: string]: string } = {
        '.js': 'javascript',
        '.ts': 'typescript',
        '.jsx': 'javascript',
        '.tsx': 'typescript',
        '.py': 'python',
        '.java': 'java',
        '.html': 'html',
        '.css': 'css',
        '.scss': 'scss',
        '.json': 'json',
        '.md': 'markdown',
        '.xml': 'xml',
        '.yaml': 'yaml',
        '.yml': 'yaml',
        '.sh': 'shell',
        '.bash': 'shell',
        '.php': 'php',
        '.rb': 'ruby',
        '.go': 'go',
        '.rs': 'rust',
        '.cpp': 'cpp',
        '.c': 'c',
        '.cs': 'csharp',
        '.vue': 'vue',
        '.svelte': 'svelte',
        '.sql': 'sql',
        '.graphql': 'graphql',
        '.proto': 'protobuf'
    };

    private readonly maxFileSizeBytes = 1024 * 1024; // 1MB limit

    private isBinaryPath(filePath: string): boolean {
        return this.binaryExtensions.some(ext => 
            filePath.toLowerCase().endsWith(ext)
        );
    }

    private isQuickIgnored(filename: string): boolean {
        const quickIgnoreList = [
            'node_modules',
            '.git',
            'dist',
            'build',
            '.next',
            'coverage',
            '.vscode',
            '.idea'
        ];
        return quickIgnoreList.includes(filename);
    }

    async exportProject() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('No workspace folder open');
        }

        const rootPath = workspaceFolders[0].uri.fsPath;
        
        const format = await vscode.window.showQuickPick(
            ['Markdown', 'JSON', 'Text'],
            { 
                placeHolder: 'Select export format',
                title: 'Export Format'
            }
        ) as ExportFormat | undefined;
        
        if (!format) return;

        const extensions: Record<ExportFormat, string> = {
            'Markdown': 'md',
            'JSON': 'json',
            'Text': 'txt'
        };

        const fileExtension = extensions[format];

        const filters: Record<string, string[]> = {
            [format]: [fileExtension]
        };

        const outputPath = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(path.join(rootPath, `project-export.${fileExtension}`)),
            filters
        });

        if (!outputPath) return;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Exporting Project",
            cancellable: true
        }, async (progress, token) => {
            try {
                progress.report({ 
                    message: 'Scanning project...',
                    increment: 0 
                });
                
                const startTime = Date.now();
                const files = await this.collectFiles(rootPath, progress, token);
                
                if (token.isCancellationRequested) {
                    vscode.window.showInformationMessage('Export cancelled');
                    return;
                }

                progress.report({ 
                    message: `Found ${files.length} files. Generating output...`,
                    increment: 50 
                });
                
                const structure = await this.getProjectStructure(rootPath);
                const output = this.formatOutput(files, structure, format);
                
                progress.report({ 
                    message: 'Saving file...',
                    increment: 75 
                });
                
                await fsPromises.writeFile(outputPath.fsPath, output, 'utf-8');
                
                const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                vscode.window.showInformationMessage(
                    `Export complete! Processed ${files.length} files in ${duration}s`
                );
            } catch (error) {
                vscode.window.showErrorMessage(`Export failed: ${error}`);
                throw error;
            }
        });
    }

    async quickExport() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            throw new Error('No active editor');
        }

        const format = await vscode.window.showQuickPick(
            ['Markdown', 'Text'],
            { placeHolder: 'Select quick export format' }
        ) as QuickExportFormat | undefined;

        if (!format) return;

        const document = editor.document;
        const selection = editor.selection;
        const content = selection.isEmpty ? 
            document.getText() : 
            document.getText(selection);

        let output: string;
        if (format === 'Text') {
            output = `FILE: ${document.fileName}\n\n${content}`;
        } else {
            output = `# Quick Export\n\n## File: ${document.fileName}\n\n\`\`\`${document.languageId}\n${content}\n\`\`\``;
        }

        await vscode.env.clipboard.writeText(output);
        vscode.window.showInformationMessage(`Quick export (${format}) copied to clipboard!`);
    }

    private async collectFiles(
        rootPath: string,
        progress: vscode.Progress<{message?: string; increment?: number}>,
        token: vscode.CancellationToken
    ): Promise<FileData[]> {
        const files: FileData[] = [];
        let scannedFiles = 0;
        let totalFiles = 0;

        // First, count total files for progress
        const countFiles = async (dir: string) => {
            try {
                const items = await fsPromises.readdir(dir);
                for (const item of items) {
                    if (token.isCancellationRequested) return;
                    
                    const fullPath = path.join(dir, item);
                    const relativePath = path.relative(rootPath, fullPath);
                    
                    if (this.isQuickIgnored(item)) continue;
                    
                    const stat = await fsPromises.stat(fullPath);
                    if (stat.isDirectory()) {
                        await countFiles(fullPath);
                    } else {
                        totalFiles++;
                    }
                }
            } catch (error) {
                console.warn(`Error counting files in ${dir}:`, error);
            }
        };

        await countFiles(rootPath);
        
        const traverse = async (dir: string) => {
            try {
                const items = await fsPromises.readdir(dir);
                for (const item of items) {
                    if (token.isCancellationRequested) return;

                    const fullPath = path.join(dir, item);
                    const relativePath = path.relative(rootPath, fullPath);

                    // Quick ignore check first
                    if (this.isQuickIgnored(item)) continue;

                    // Then do the full pattern check
                    if (this.defaultIgnore.some(pattern => {
                        const regex = new RegExp(pattern.replace(/\*\*/g, '.*'));
                        return regex.test(relativePath);
                    })) continue;

                    const stat = await fsPromises.stat(fullPath);
                    scannedFiles++;

                    progress.report({ 
                        message: `Scanning: ${relativePath} (${scannedFiles}/${totalFiles})`,
                        increment: (100 / totalFiles)
                    });

                    if (stat.isDirectory()) {
                        await traverse(fullPath);
                    } else {
                        // Skip large files
                        if (stat.size > this.maxFileSizeBytes) {
                            console.warn(`Skipping large file: ${relativePath}`);
                            continue;
                        }

                        if (!this.isBinaryPath(fullPath)) {
                            try {
                                const content = await fsPromises.readFile(fullPath, 'utf-8');
                                files.push({
                                    path: relativePath,
                                    content,
                                    language: this.getLanguageId(fullPath),
                                    size: stat.size,
                                    lastModified: stat.mtime
                                });
                            } catch (error) {
                                console.warn(`Failed to read file: ${relativePath}`, error);
                            }
                        }
                    }
                }
            } catch (error) {
                console.warn(`Error processing directory ${dir}:`, error);
            }
        };

        await traverse(rootPath);
        return files;
    }

    private async getProjectStructure(rootPath: string): Promise<string> {
        const items: string[] = [];
        
        const traverse = async (dir: string, prefix: string = '') => {
            const files = await fsPromises.readdir(dir);
            files.sort((a, b) => {
                const aIsDir = fs.statSync(path.join(dir, a)).isDirectory();
                const bIsDir = fs.statSync(path.join(dir, b)).isDirectory();
                if (aIsDir && !bIsDir) return -1;
                if (!aIsDir && bIsDir) return 1;
                return a.localeCompare(b);
            });
            
            for (const file of files) {
                const fullPath = path.join(dir, file);
                const relativePath = path.relative(rootPath, fullPath);

                if (this.isQuickIgnored(file)) continue;
                
                if (this.defaultIgnore.some(pattern => {
                    const regex = new RegExp(pattern.replace(/\*\*/g, '.*'));
                    return regex.test(relativePath);
                })) continue;
                
                const stat = await fsPromises.stat(fullPath);
                
                if (stat.isDirectory()) {
                    items.push(prefix + '📁 ' + file);
                    await traverse(fullPath, prefix + '  ');
                } else {
                    if (!this.isBinaryPath(fullPath)) {
                        items.push(prefix + '📄 ' + file);
                    }
                }
            }
        };
        
        await traverse(rootPath);
        return items.join('\n');
    }

    private formatOutput(files: FileData[], structure: string, format: ExportFormat): string {
        switch (format) {
            case 'JSON':
                return JSON.stringify({
                    exportDate: new Date().toISOString(),
                    structure,
                    files: files.map(f => ({
                        ...f,
                        lastModified: f.lastModified.toISOString()
                    }))
                }, null, 2);

            case 'Text':
                let txtOutput = 'PROJECT EXPORT\n\n';
                txtOutput += 'PROJECT STRUCTURE:\n\n' + structure + '\n\n';
                txtOutput += 'FILES:\n\n';
                
                for (const file of files) {
                    txtOutput += `=== ${file.path} ===\n\n`;
                    txtOutput += file.content + '\n\n';
                    txtOutput += '='.repeat(40) + '\n\n';
                }
                return txtOutput;

            case 'Markdown':
            default:
                let output = '# Project Export\n\n';
                output += '## Project Structure\n\n```\n' + structure + '\n```\n\n';
                output += '## Files\n\n';
                
                for (const file of files) {
                    output += `### ${file.path}\n`;
                    output += `Last modified: ${file.lastModified.toISOString()}\n`;
                    output += `Size: ${(file.size / 1024).toFixed(2)} KB\n\n`;
                    output += '```' + (file.language || '') + '\n';
                    output += file.content + '\n```\n\n';
                }
                
                return output;
        }
    }

    private getLanguageId(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        return this.languageMap[ext] || '';
    }
}