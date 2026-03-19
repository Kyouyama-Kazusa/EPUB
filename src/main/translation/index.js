const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const LLMClient = require('./llm-client');
const EpubParser = require('./epub-parser');
const BilingualEpubGenerator = require('./epub-generator');
const ProgressTracker = require('./progress-tracker');
const { getTranslationConfig } = require('./config-manager');

class TranslationEngine {
  constructor() {
    this.llmClient = null;
    this.currentTask = null;
    this.isCancelled = false;
    this.onProgress = null;
  }

  async startTranslation(bookId, bookFilePath, options = {}) {
    this.isCancelled = false;
    
    const config = getTranslationConfig();
    this.llmClient = new LLMClient(config);
    
    const existingTask = ProgressTracker.getTaskByBookId(bookId);
    if (existingTask && ['pending', 'translating', 'paused'].includes(existingTask.status)) {
      this.currentTask = existingTask;
      return this.resumeTranslation(existingTask.id, bookFilePath);
    }
    
    this.currentTask = ProgressTracker.createTask(bookId, config);
    
    return this.translateBook(bookId, bookFilePath);
  }

  async translateBook(bookId, bookFilePath) {
    try {
      ProgressTracker.updateTaskStatus(this.currentTask.id, 'translating');
      
      this.reportProgress({
        status: 'parsing',
        message: '正在解析 EPUB 文件...',
        progress: 0
      });
      
      const epubParser = new EpubParser(bookFilePath);
      const epubData = await epubParser.parse();
      
      const allParagraphs = [];
      for (const chapter of epubData.chapters) {
        for (let i = 0; i < chapter.paragraphs.length; i++) {
          allParagraphs.push({
            chapterIndex: chapter.index,
            paragraphIndex: i,
            text: chapter.paragraphs[i].text,
            tag: chapter.paragraphs[i].tag,
            chapterHref: chapter.href
          });
        }
      }
      
      ProgressTracker.updateTaskTotals(this.currentTask.id, allParagraphs.length);
      
      this.reportProgress({
        status: 'translating',
        message: '开始翻译...',
        progress: 0,
        total: allParagraphs.length,
        translated: 0
      });
      
      const translatedResults = [];
      let totalTokens = 0;
      
      for (let i = 0; i < allParagraphs.length; i++) {
        if (this.isCancelled) {
          ProgressTracker.updateTaskStatus(this.currentTask.id, 'paused');
          this.reportProgress({
            status: 'paused',
            message: '翻译已暂停',
            progress: (i / allParagraphs.length) * 100,
            translated: i,
            total: allParagraphs.length
          });
          return { status: 'paused', taskId: this.currentTask.id };
        }
        
        const para = allParagraphs[i];
        
        if (para.text.trim().length === 0) {
          translatedResults.push({
            chapterIndex: para.chapterIndex,
            paragraphIndex: para.paragraphIndex,
            originalText: para.text,
            translatedText: '',
            tokensUsed: 0
          });
          continue;
        }
        
        try {
          const result = await this.llmClient.translate(para.text);
          
          translatedResults.push({
            chapterIndex: para.chapterIndex,
            paragraphIndex: para.paragraphIndex,
            originalText: para.text,
            translatedText: result.text,
            tokensUsed: result.tokens
          });
          
          totalTokens += result.tokens;
          
          ProgressTracker.saveTranslationResult(
            this.currentTask.id,
            para.paragraphIndex,
            para.text,
            result.text,
            result.tokens
          );
          
          ProgressTracker.updateTaskProgress(this.currentTask.id, i + 1, totalTokens);
          
          const cost = this.llmClient.estimateCost(totalTokens);
          
          this.reportProgress({
            status: 'translating',
            message: `翻译中: ${para.text.substring(0, 30)}...`,
            progress: ((i + 1) / allParagraphs.length) * 100,
            translated: i + 1,
            total: allParagraphs.length,
            tokens: totalTokens,
            estimatedCost: cost
          });
          
        } catch (error) {
          console.error(`Translation error at paragraph ${i}:`, error);
          
          translatedResults.push({
            chapterIndex: para.chapterIndex,
            paragraphIndex: para.paragraphIndex,
            originalText: para.text,
            translatedText: `[翻译失败] ${para.text}`,
            tokensUsed: 0,
            error: error.message
          });
        }
        
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      this.reportProgress({
        status: 'generating',
        message: '正在生成双语 EPUB...',
        progress: 95
      });
      
      const book = {
        filePath: bookFilePath,
        metadata: epubData.metadata,
        chapters: epubData.chapters,
        opfPath: epubData.opfPath,
        styles: epubData.styles,
        images: epubData.images
      };
      
      const generator = new BilingualEpubGenerator(book, translatedResults);
      const outputPath = await this.generateOutputPath(bookFilePath);
      await generator.generate(outputPath);
      
      ProgressTracker.updateTaskStatus(this.currentTask.id, 'completed');
      
      this.reportProgress({
        status: 'completed',
        message: '翻译完成!',
        progress: 100,
        outputPath
      });
      
      return {
        status: 'completed',
        taskId: this.currentTask.id,
        outputPath
      };
      
    } catch (error) {
      console.error('Translation failed:', error);
      ProgressTracker.updateTaskStatus(this.currentTask.id, 'failed');
      
      this.reportProgress({
        status: 'failed',
        message: `翻译失败: ${error.message}`,
        error: error.message
      });
      
      throw error;
    }
  }

  async resumeTranslation(taskId, bookFilePath) {
    const task = ProgressTracker.getTask(taskId);
    if (!task) {
      throw new Error('Task not found');
    }
    
    this.currentTask = task;
    this.isCancelled = false;
    
    return this.translateBook(task.book_id, bookFilePath);
  }

  cancel() {
    this.isCancelled = true;
  }

  reportProgress(data) {
    if (this.onProgress) {
      this.onProgress(data);
    }
  }

  async generateOutputPath(originalPath) {
    const dir = app.getPath('documents');
    const filename = path.basename(originalPath, '.epub');
    const timestamp = Date.now();
    return path.join(dir, `${filename}_bilingual_${timestamp}.epub`);
  }

  setProgressCallback(callback) {
    this.onProgress = callback;
  }
}

module.exports = TranslationEngine;
