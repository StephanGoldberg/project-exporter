import * as vscode from 'vscode';
import { ProjectExporter } from './projectExporter';

export function activate(context: vscode.ExtensionContext) {
    console.log('Project Exporter is now active!');

    // Create a more prominent status bar item
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        1000
    );
    statusBarItem.text = "$(export) Export for AI";
    statusBarItem.tooltip = "Export project for AI analysis";
    statusBarItem.command = 'project-exporter.export';
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    statusBarItem.show();

    const exporter = new ProjectExporter();
    
    // Register commands
    let exportCommand = vscode.commands.registerCommand('project-exporter.export', async () => {
        console.log('Export command triggered');
        try {
            await exporter.exportProject();
        } catch (error) {
            vscode.window.showErrorMessage(`Export failed: ${error}`);
        }
    });

    let quickExportCommand = vscode.commands.registerCommand('project-exporter.quickExport', async () => {
        console.log('Quick export command triggered');
        try {
            await exporter.quickExport();
        } catch (error) {
            vscode.window.showErrorMessage(`Quick export failed: ${error}`);
        }
    });

    context.subscriptions.push(exportCommand, quickExportCommand, statusBarItem);

    // Show welcome message with instructions
    vscode.window.showInformationMessage(
        'Project Exporter is active! Look for "Export for AI" button in the status bar (bottom-right) or use Command Palette.',
        'Show Me'
    ).then(selection => {
        if (selection === 'Show Me') {
            const originalBg = statusBarItem.backgroundColor;
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            setTimeout(() => {
                statusBarItem.backgroundColor = originalBg;
            }, 2000);
        }
    });
}

export function deactivate() {}