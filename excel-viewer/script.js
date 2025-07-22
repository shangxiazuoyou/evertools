class ExcelViewer {
    constructor() {
        this.files = [];
        this.currentFile = null;
        this.currentSheet = null;
        this.currentWorkbook = null;
        this.frozenRows = 1;
        this.currentData = null;
        this.maxFileSize = 50 * 1024 * 1024; // 50MB限制
        this.maxRows = 100000; // 最大行数限制
        this.virtualScrollEnabled = false;
        this.rowHeight = 49;
        this.visibleRows = 20;
        this.scrollTop = 0;
        this.worker = null;
        this.currentPage = 1;
        this.pageSize = 500;
        this.totalRows = 0;
        this.paginationEnabled = false;
        
        // 内存管理
        this.memoryManager = new MemoryManager();
        this.dataCache = new Map();
        this.renderCache = new Map();
        this.cleanupInterval = null;
        this.lastMemoryCheck = Date.now();
        
        // 弱引用管理器（兼容性检查）
        this.weakRefs = new Map();
        if (typeof WeakRef !== 'undefined' && typeof FinalizationRegistry !== 'undefined') {
            this.finalizationRegistry = new FinalizationRegistry((heldValue) => {
                console.log('清理弱引用对象:', heldValue);
                this.weakRefs.delete(heldValue);
            });
            this.supportsWeakRef = true;
        } else {
            console.warn('浏览器不支持WeakRef，使用常规清理策略');
            this.finalizationRegistry = null;
            this.supportsWeakRef = false;
        }
        
        // 操作历史
        this.operationHistory = [];
        this.currentHistoryIndex = -1;
        
        // DOM元素缓存
        this.domCache = {};
        this.memoryCheckInterval = 30000; // 默认30秒检查一次
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupFreezeControls();
        this.setupVirtualScrolling();
        this.setupPagination();
        this.setupTableViewControls();
        this.loadTableHeightPreference();
        this.startMemoryMonitoring();
    }

    setupEventListeners() {
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');

        uploadArea.addEventListener('click', () => {
            fileInput.click();
        });

        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            this.handleFiles(e.dataTransfer.files);
        });

        fileInput.addEventListener('change', (e) => {
            this.handleFiles(e.target.files);
        });
    }

    setupFreezeControls() {
        const applyFreezeBtn = document.getElementById('applyFreeze');
        const clearFreezeBtn = document.getElementById('clearFreeze');
        const freezeRowsInput = document.getElementById('freezeRows');

        applyFreezeBtn.addEventListener('click', () => {
            this.frozenRows = parseInt(freezeRowsInput.value) || 0;
            this.updateFrozenRows();
        });

        clearFreezeBtn.addEventListener('click', () => {
            this.frozenRows = 0;
            freezeRowsInput.value = 0;
            this.updateFrozenRows();
        });

        freezeRowsInput.addEventListener('change', (e) => {
            const value = parseInt(e.target.value) || 0;
            if (value >= 0 && value <= 10) {
                this.frozenRows = value;
                this.updateFrozenRows();
            }
        });
    }

    setupVirtualScrolling() {
        this.visibleRows = Math.ceil(600 / this.rowHeight) + 5; // 缓冲区
    }

    enableVirtualScrolling() {
        const container = document.getElementById('tableContainer');
        if (!container || this.virtualScrollEnabled) return;

        this.virtualScrollEnabled = true;
        
        container.addEventListener('scroll', () => {
            if (this.currentData && this.currentData.length > this.visibleRows) {
                this.throttledVirtualRender();
            }
        });
    }

    throttledVirtualRender = this.throttle(() => {
        this.renderVirtualTable();
    }, 16); // 60fps

    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    setupPagination() {
        const pageSize = document.getElementById('pageSize');
        const firstPage = document.getElementById('firstPage');
        const prevPage = document.getElementById('prevPage');
        const nextPage = document.getElementById('nextPage');
        const lastPage = document.getElementById('lastPage');

        pageSize.addEventListener('change', (e) => {
            this.pageSize = parseInt(e.target.value);
            this.currentPage = 1;
            if (this.paginationEnabled) {
                this.renderPaginatedData();
            }
        });

        firstPage.addEventListener('click', () => {
            this.currentPage = 1;
            this.renderPaginatedData();
        });

        prevPage.addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.renderPaginatedData();
            }
        });

        nextPage.addEventListener('click', () => {
            const totalPages = Math.ceil(this.totalRows / this.pageSize);
            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.renderPaginatedData();
            }
        });

        lastPage.addEventListener('click', () => {
            const totalPages = Math.ceil(this.totalRows / this.pageSize);
            this.currentPage = totalPages;
            this.renderPaginatedData();
        });
    }

    setupTableViewControls() {
        const expandBtn = document.getElementById('expandTable');
        const fitContentBtn = document.getElementById('fitContent');
        const heightSlider = document.getElementById('tableHeight');
        const heightValue = document.getElementById('heightValue');

        if (expandBtn) {
            expandBtn.addEventListener('click', () => {
                this.toggleFullscreen();
            });
        }

        if (fitContentBtn) {
            fitContentBtn.addEventListener('click', () => {
                this.fitTableToContent();
            });
        }

        if (heightSlider) {
            heightSlider.addEventListener('input', (e) => {
                const height = parseInt(e.target.value);
                this.setTableHeight(height);
                heightValue.textContent = `${height}px`;
            });
        }

        // ESC键退出全屏
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isFullscreen) {
                this.exitFullscreen();
            }
        });
        
        // 初始化全屏状态
        this.isFullscreen = false;
    }

    toggleFullscreen() {
        if (this.isFullscreen) {
            this.exitFullscreen();
        } else {
            this.enterFullscreen();
        }
    }

    enterFullscreen() {
        const tableContainer = document.getElementById('tableContainer');
        const currentContent = tableContainer.innerHTML;
        
        // 创建全屏覆盖层
        const overlay = document.createElement('div');
        overlay.className = 'fullscreen-overlay';
        overlay.id = 'fullscreenOverlay';
        
        overlay.innerHTML = `
            <div class="fullscreen-header">
                <div class="fullscreen-title">${this.currentFile?.name || 'Excel数据'} - 全屏查看</div>
                <button class="fullscreen-close" onclick="excelViewer.exitFullscreen()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                    退出全屏
                </button>
            </div>
            <div class="fullscreen-content">
                <div class="table-container fullscreen" id="fullscreenTable">
                    ${currentContent}
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        this.isFullscreen = true;
        
        // 隐藏页面滚动
        document.body.style.overflow = 'hidden';
        
        // 更新按钮文字
        const expandBtn = document.getElementById('expandTable');
        if (expandBtn) {
            expandBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
                </svg>
                退出全屏
            `;
        }
    }

    exitFullscreen() {
        const overlay = document.getElementById('fullscreenOverlay');
        if (overlay) {
            document.body.removeChild(overlay);
        }
        
        this.isFullscreen = false;
        document.body.style.overflow = '';
        
        // 恢复按钮文字
        const expandBtn = document.getElementById('expandTable');
        if (expandBtn) {
            expandBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                </svg>
                全屏显示
            `;
        }
    }

    fitTableToContent() {
        const tableContainer = document.getElementById('tableContainer');
        const table = tableContainer.querySelector('.data-table');
        
        if (table) {
            // 计算表格实际需要的高度
            const tableHeight = table.offsetHeight;
            const maxHeight = Math.min(tableHeight + 40, window.innerHeight * 0.8); // 最大80%视窗高度
            const minHeight = 300;
            const finalHeight = Math.max(minHeight, Math.min(maxHeight, tableHeight + 40));
            
            tableContainer.style.height = `${finalHeight}px`;
            
            // 更新滑块值
            const heightSlider = document.getElementById('tableHeight');
            const heightValue = document.getElementById('heightValue');
            if (heightSlider && heightValue) {
                heightSlider.value = finalHeight;
                heightValue.textContent = `${finalHeight}px`;
            }
            
            console.log(`表格高度已适应内容: ${finalHeight}px (表格实际高度: ${tableHeight}px)`);
        }
    }

    setTableHeight(height) {
        const tableContainer = document.getElementById('tableContainer');
        tableContainer.style.height = `${height}px`;
        
        // 保存用户偏好
        localStorage.setItem('excelViewerTableHeight', height);
    }

    loadTableHeightPreference() {
        const savedHeight = localStorage.getItem('excelViewerTableHeight');
        if (savedHeight) {
            const height = parseInt(savedHeight);
            this.setTableHeight(height);
            
            // 更新控件
            const heightSlider = document.getElementById('tableHeight');
            const heightValue = document.getElementById('heightValue');
            if (heightSlider && heightValue) {
                heightSlider.value = height;
                heightValue.textContent = `${height}px`;
            }
        }
    }

    async handleFiles(files) {
        const validFiles = Array.from(files).filter(file => {
            if (this.isValidFile(file)) {
                return true;
            } else {
                this.showError(`不支持的文件类型: ${file.name}`);
                return false;
            }
        });

        if (validFiles.length === 0) return;

        // 显示上传进度
        this.showUploadProgress();

        for (let i = 0; i < validFiles.length; i++) {
            const file = validFiles[i];
            
            // 更新进度状态
            this.updateUploadProgress(
                Math.round(((i + 0.5) / validFiles.length) * 100),
                `正在处理文件 ${i + 1}/${validFiles.length}: ${file.name}`,
                `文件大小: ${this.formatFileSize(file.size)}`
            );
            
            await this.addFileWithProgress(file);
            
            // 完成当前文件
            this.updateUploadProgress(
                Math.round(((i + 1) / validFiles.length) * 100),
                `已完成 ${i + 1}/${validFiles.length} 个文件`,
                validFiles.length > 1 ? `还剩 ${validFiles.length - i - 1} 个文件` : '处理完成'
            );
        }

        // 隐藏上传进度，延迟以显示完成状态
        setTimeout(() => {
            this.hideUploadProgress();
        }, 1000);
    }

    showUploadProgress() {
        const uploadText = document.getElementById('uploadText');
        const uploadProgress = document.getElementById('uploadProgress');
        
        uploadText.style.display = 'none';
        uploadProgress.style.display = 'flex';
        
        // 添加上传中样式
        const uploadArea = document.getElementById('uploadArea');
        uploadArea.classList.add('uploading');
    }

    updateUploadProgress(percentage, statusText, detailText) {
        const progressFill = document.getElementById('uploadProgressFill');
        const statusTextEl = document.getElementById('uploadStatusText');
        const statusDetail = document.getElementById('uploadStatusDetail');
        
        if (progressFill) progressFill.style.width = `${percentage}%`;
        if (statusTextEl) statusTextEl.textContent = statusText;
        if (statusDetail) statusDetail.textContent = detailText || `${percentage}%`;
    }

    hideUploadProgress() {
        const uploadText = document.getElementById('uploadText');
        const uploadProgress = document.getElementById('uploadProgress');
        
        uploadText.style.display = 'block';
        uploadProgress.style.display = 'none';
        
        // 移除上传中样式
        const uploadArea = document.getElementById('uploadArea');
        uploadArea.classList.remove('uploading');
    }

    async addFileWithProgress(file) {
        if (this.files.some(f => f.name === file.name)) {
            this.showError(`文件 ${file.name} 已存在`);
            return;
        }

        this.files.push(file);
        this.renderFileList();
        await this.processFile(file);
    }

    isValidFile(file) {
        // 检查文件大小
        if (file.size > this.maxFileSize) {
            this.showError(`文件过大: ${file.name} (${this.formatFileSize(file.size)})，最大支持${this.formatFileSize(this.maxFileSize)}`);
            return false;
        }

        const validTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'text/csv',
            'application/csv'
        ];
        
        const validExtensions = ['.xlsx', '.xls', '.csv'];
        const fileName = file.name.toLowerCase();
        
        return validTypes.includes(file.type) || 
               validExtensions.some(ext => fileName.endsWith(ext));
    }

    addFile(file) {
        if (this.files.some(f => f.name === file.name)) {
            this.showError(`文件 ${file.name} 已存在`);
            return;
        }

        this.files.push(file);
        this.renderFileList();
        this.processFile(file);
    }

    removeFile(fileName) {
        // 确认删除
        this.showConfirmation(
            '确认删除',
            `确定要删除文件 "${fileName}" 吗？`,
            '删除',
            '取消',
            () => this.performRemoveFile(fileName),
            null,
            'danger'
        );
    }

    performRemoveFile(fileName) {
        // 保存操作历史
        const fileToRemove = this.files.find(f => f.name === fileName);
        if (fileToRemove) {
            this.addToHistory('remove_file', { 
                file: fileToRemove, 
                wasCurrentFile: this.currentFile && this.currentFile.name === fileName 
            });
        }

        // 清理相关数据和缓存
        this.cleanupFileData(fileName);
        
        this.files = this.files.filter(file => file.name !== fileName);
        this.renderFileList();
        
        if (this.currentFile && this.currentFile.name === fileName) {
            this.currentFile = null;
            this.currentSheet = null;
            this.currentWorkbook = null;
            this.currentData = null;
            this.currentDataCompressed = null;
            this.clearDisplay();
            
            // 强制垃圾回收
            setTimeout(() => {
                this.memoryManager.forceGarbageCollection();
            }, 100);
        }

        // 显示撤销提示
        this.showUndoNotification(`已删除文件 "${fileName}"`, () => this.undoLastOperation());
    }

    showConfirmation(title, message, confirmText, cancelText, onConfirm, onCancel, type = 'primary') {
        const overlay = document.createElement('div');
        overlay.className = 'confirmation-overlay';
        
        const modal = document.createElement('div');
        modal.className = `confirmation-modal ${type}`;
        
        modal.innerHTML = `
            <div class="confirmation-header">
                <h3>${title}</h3>
            </div>
            <div class="confirmation-body">
                <p>${message}</p>
            </div>
            <div class="confirmation-actions">
                <button class="btn btn-cancel">${cancelText}</button>
                <button class="btn btn-confirm btn-${type}">${confirmText}</button>
            </div>
        `;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // 事件处理
        const handleCancel = () => {
            document.body.removeChild(overlay);
            if (onCancel) onCancel();
        };
        
        const handleConfirm = () => {
            document.body.removeChild(overlay);
            if (onConfirm) onConfirm();
        };
        
        modal.querySelector('.btn-cancel').addEventListener('click', handleCancel);
        modal.querySelector('.btn-confirm').addEventListener('click', handleConfirm);
        
        // ESC键取消
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                handleCancel();
                document.removeEventListener('keydown', handleKeyDown);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        
        // 点击背景取消
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                handleCancel();
            }
        });
    }

    addToHistory(type, data) {
        // 清除当前位置后的历史
        this.operationHistory = this.operationHistory.slice(0, this.currentHistoryIndex + 1);
        
        // 添加新操作
        this.operationHistory.push({
            type,
            data,
            timestamp: Date.now()
        });
        
        this.currentHistoryIndex = this.operationHistory.length - 1;
        
        // 限制历史记录数量
        if (this.operationHistory.length > 10) {
            this.operationHistory.shift();
            this.currentHistoryIndex--;
        }
    }

    undoLastOperation() {
        if (this.currentHistoryIndex >= 0) {
            const operation = this.operationHistory[this.currentHistoryIndex];
            
            switch (operation.type) {
                case 'remove_file':
                    this.undoRemoveFile(operation.data);
                    break;
            }
            
            this.currentHistoryIndex--;
        }
    }

    undoRemoveFile(data) {
        const { file, wasCurrentFile } = data;
        
        // 重新添加文件到列表
        this.files.push(file);
        this.renderFileList();
        
        // 如果之前是当前文件，重新处理
        if (wasCurrentFile) {
            this.processFile(file);
        }
        
        this.showUndoNotification(`已恢复文件 "${file.name}"`, null);
    }

    showUndoNotification(message, undoAction) {
        const notification = document.createElement('div');
        notification.className = 'undo-notification';
        
        notification.innerHTML = `
            <span class="undo-message">${message}</span>
            ${undoAction ? '<button class="undo-btn">撤销</button>' : ''}
        `;
        
        document.body.appendChild(notification);
        
        if (undoAction) {
            notification.querySelector('.undo-btn').addEventListener('click', () => {
                undoAction();
                document.body.removeChild(notification);
            });
        }
        
        // 5秒后自动消失
        setTimeout(() => {
            if (notification.parentNode) {
                notification.classList.add('fade-out');
                setTimeout(() => {
                    if (notification.parentNode) {
                        document.body.removeChild(notification);
                    }
                }, 300);
            }
        }, 5000);
    }

    cleanupFileData(fileName) {
        // 清理与文件相关的所有缓存
        const keysToDelete = [];
        
        for (const key of this.dataCache.keys()) {
            if (key.includes(fileName)) {
                keysToDelete.push(key);
            }
        }
        
        for (const key of this.renderCache.keys()) {
            if (key.includes(fileName)) {
                keysToDelete.push(key);
            }
        }
        
        keysToDelete.forEach(key => {
            this.dataCache.delete(key);
            this.renderCache.delete(key);
        });
    }

    renderFileList() {
        const fileList = document.getElementById('fileList');
        
        if (this.files.length === 0) {
            fileList.innerHTML = '';
            return;
        }

        fileList.innerHTML = this.files.map(file => `
            <div class="file-item">
                <div class="file-info">
                    <span class="file-icon">📄</span>
                    <span class="file-name">${file.name}</span>
                    <span class="file-size">(${this.formatFileSize(file.size)})</span>
                </div>
                <button class="remove-btn" onclick="excelViewer.removeFile('${file.name}')">
                    删除
                </button>
            </div>
        `).join('');
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async processFile(file) {
        try {
            this.processingStartTime = Date.now();
            this.showProgressLoading(0, '正在准备处理文件...', `文件: ${file.name} (${this.formatFileSize(file.size)})`);
            
            // 对于大文件使用Web Worker
            if (file.size > 5 * 1024 * 1024) { // 5MB以上使用Worker
                await this.processFileWithWorker(file);
            } else {
                await this.processFileDirectly(file);
            }
            
        } catch (error) {
            console.error('文件处理错误:', error);
            this.showEnhancedError(`文件处理失败: ${error.message}`, file.name);
        } finally {
            this.processingStartTime = null;
        }
    }

    async processFileWithWorker(file) {
        return new Promise(async (resolve, reject) => {
            if (this.worker) {
                this.worker.terminate();
            }

            this.worker = new Worker('excel-worker.js');
            
            this.worker.onmessage = (e) => {
                const { type, progress, message, result, error, processingTime } = e.data;
                
                switch (type) {
                    case 'PROGRESS':
                        this.showProgressLoading(progress, message);
                        break;
                        
                    case 'COMPLETE':
                        this.handleWorkerResult(result, file);
                        this.showSuccess(`成功加载文件: ${file.name} (${processingTime}ms)`);
                        resolve();
                        break;
                        
                    case 'ERROR':
                        this.showError(`Worker处理失败: ${error}`);
                        reject(new Error(error));
                        break;
                }
            };

            this.worker.onerror = (error) => {
                console.error('Worker错误:', error);
                this.showEnhancedError('后台处理失败', file.name, [
                    '尝试刷新页面后重新上传',
                    '检查文件是否损坏或格式错误',
                    '如果文件过大，请尝试分割后上传'
                ]);
                reject(error);
            };

            const data = await this.readFile(file);
            const isCSV = file.name.toLowerCase().endsWith('.csv');
            
            this.worker.postMessage({
                type: isCSV ? 'PARSE_CSV' : 'PARSE_EXCEL',
                data: data,
                fileName: file.name
            });
        });
    }

    async processFileDirectly(file) {
        const data = await this.readFile(file);
        let workbook;

        if (file.name.toLowerCase().endsWith('.csv')) {
            workbook = this.parseCSV(data);
        } else {
            workbook = XLSX.read(data, { 
                type: 'binary',
                cellDates: true,
                dateNF: 'yyyy-mm-dd hh:mm:ss'
            });
        }

        this.currentFile = file;
        this.currentWorkbook = workbook;
        this.renderTabs(workbook);
        this.showSheet(workbook, workbook.SheetNames[0]);
        this.showSuccess(`成功加载文件: ${file.name}`);
    }

    handleWorkerResult(result, file) {
        // 模拟XLSX格式
        const workbook = {
            SheetNames: result.sheetNames,
            Sheets: {}
        };

        result.sheetNames.forEach(sheetName => {
            const jsonData = result.sheets[sheetName];
            const worksheet = XLSX.utils.aoa_to_sheet(jsonData);
            workbook.Sheets[sheetName] = worksheet;
        });

        // 使用弱引用存储大对象（如果支持）
        if (this.supportsWeakRef && this.estimateObjectSize(workbook) > 1024 * 1024) {
            const weakRef = new WeakRef(workbook);
            const refKey = `workbook-${file.name}-${Date.now()}`;
            this.weakRefs.set(refKey, weakRef);
            this.finalizationRegistry.register(workbook, refKey);
        }

        this.currentFile = file;
        this.currentWorkbook = workbook;
        this.renderTabs(workbook);
        this.showSheet(workbook, workbook.SheetNames[0]);
    }

    estimateObjectSize(obj) {
        try {
            return JSON.stringify(obj).length * 2; // 粗略估计
        } catch (e) {
            return 0;
        }
    }

    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                let result = e.target.result;
                
                // 如果是CSV文件，尝试处理编码问题
                if (file.name.toLowerCase().endsWith('.csv')) {
                    result = this.handleCSVEncoding(result, file.name);
                }
                
                resolve(result);
            };
            reader.onerror = (e) => {
                console.error('文件读取错误:', e);
                const errorMsg = e.target?.error?.message || '文件读取失败';
                reject(new Error(`文件读取错误: ${errorMsg}`));
            };
            
            // 对于CSV文件使用UTF-8读取，其他文件使用二进制
            if (file.name.toLowerCase().endsWith('.csv')) {
                reader.readAsText(file, 'UTF-8');
            } else {
                reader.readAsBinaryString(file);
            }
        });
    }

    handleCSVEncoding(data, fileName) {
        try {
            // 检测BOM
            if (data.charCodeAt(0) === 0xFEFF) {
                console.log(`${fileName}: 检测到UTF-8 BOM，已移除`);
                return data.slice(1);
            }
            
            // 检测可能的编码问题
            if (this.containsGarbledChars(data)) {
                console.warn(`${fileName}: 可能存在编码问题，建议转换为UTF-8格式`);
                this.showMemoryWarning('CSV文件可能存在编码问题，部分字符可能显示异常');
            }
            
            return data;
        } catch (error) {
            console.warn('编码处理失败:', error);
            return data;
        }
    }

    containsGarbledChars(data) {
        // 检测常见的编码问题字符
        const garbledPatterns = [
            /[\uFFFD]/g,  // 替换字符
            /[Ã¢â‚¬â€œ]/g,  // UTF-8误读为Latin-1的常见模式
            /[\u0080-\u009F]/g  // C1控制字符
        ];
        
        return garbledPatterns.some(pattern => pattern.test(data));
    }

    parseCSV(data) {
        const result = this.robustCSVParse(data);
        const worksheet = XLSX.utils.aoa_to_sheet(result);
        return {
            SheetNames: ['Sheet1'],
            Sheets: { 'Sheet1': worksheet }
        };
    }

    robustCSVParse(data) {
        // 检测分隔符
        const delimiter = this.detectDelimiter(data);
        console.log('检测到CSV分隔符:', delimiter);
        
        // 规范化换行符
        const normalizedData = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        
        // 使用状态机解析
        return this.parseCSVStateMachine(normalizedData, delimiter);
    }

    detectDelimiter(data) {
        // 检测前1000个字符的分隔符
        const sample = data.substring(0, 1000);
        const delimiters = [',', ';', '\t', '|'];
        let bestDelimiter = ',';
        let maxCount = 0;
        
        for (const delimiter of delimiters) {
            // 计算每行的分隔符数量，取最一致的
            const lines = sample.split('\n').slice(0, 5); // 前5行
            const counts = lines.map(line => (line.match(new RegExp(`\\${delimiter}`, 'g')) || []).length);
            
            // 检查一致性
            if (counts.length > 1) {
                const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
                const consistent = counts.every(count => Math.abs(count - avg) <= 1);
                
                if (consistent && avg > maxCount) {
                    maxCount = avg;
                    bestDelimiter = delimiter;
                }
            }
        }
        
        return bestDelimiter;
    }

    parseCSVStateMachine(data, delimiter) {
        const result = [];
        let currentRow = [];
        let currentField = '';
        let inQuotes = false;
        let i = 0;
        
        while (i < data.length) {
            const char = data[i];
            const nextChar = data[i + 1];
            
            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    // 转义引号
                    currentField += '"';
                    i += 2;
                    continue;
                } else if (!inQuotes && currentField.length === 0) {
                    // 开始引用字段
                    inQuotes = true;
                } else if (inQuotes) {
                    // 结束引用字段
                    inQuotes = false;
                }
                i++;
            } else if (char === delimiter && !inQuotes) {
                // 字段分隔符
                currentRow.push(this.cleanField(currentField));
                currentField = '';
                i++;
            } else if (char === '\n' && !inQuotes) {
                // 行结束
                currentRow.push(this.cleanField(currentField));
                if (currentRow.length > 0 && !this.isEmptyRow(currentRow)) {
                    result.push([...currentRow]);
                }
                currentRow = [];
                currentField = '';
                i++;
            } else {
                // 普通字符
                currentField += char;
                i++;
            }
        }
        
        // 处理最后一行
        if (currentField.length > 0 || currentRow.length > 0) {
            currentRow.push(this.cleanField(currentField));
            if (!this.isEmptyRow(currentRow)) {
                result.push(currentRow);
            }
        }
        
        return result;
    }

    cleanField(field) {
        // 清理字段：去除首尾空白，处理特殊值
        let cleaned = field.trim();
        
        // 处理特殊值
        if (cleaned === '' || cleaned.toLowerCase() === 'null' || cleaned.toLowerCase() === 'n/a') {
            return '';
        }
        
        // 尝试转换数字
        if (!isNaN(cleaned) && !isNaN(parseFloat(cleaned)) && cleaned !== '') {
            const num = parseFloat(cleaned);
            return isFinite(num) ? num : cleaned;
        }
        
        // 尝试转换日期
        if (this.looksLikeDate(cleaned)) {
            const date = new Date(cleaned);
            if (!isNaN(date.getTime())) {
                return date;
            }
        }
        
        return cleaned;
    }

    looksLikeDate(str) {
        // 简单的日期格式检测
        const datePatterns = [
            /^\d{4}-\d{1,2}-\d{1,2}$/,
            /^\d{1,2}\/\d{1,2}\/\d{4}$/,
            /^\d{1,2}-\d{1,2}-\d{4}$/,
            /^\d{4}\/\d{1,2}\/\d{1,2}$/
        ];
        return datePatterns.some(pattern => pattern.test(str));
    }

    isEmptyRow(row) {
        return row.every(cell => !cell || cell.toString().trim() === '');
    }

    renderTabs(workbook) {
        const tabs = document.getElementById('tabs');
        tabs.innerHTML = workbook.SheetNames.map(name => `
            <div class="tab" onclick="excelViewer.selectSheet('${name}')">${name}</div>
        `).join('');
    }

    selectSheet(sheetName) {
        if (!this.currentWorkbook) return;
        this.showSheet(this.currentWorkbook, sheetName);
    }

    showSheet(workbook, sheetName) {
        this.currentSheet = sheetName;
        
        const tabs = document.querySelectorAll('.tab');
        tabs.forEach(tab => {
            tab.classList.remove('active');
            if (tab.textContent === sheetName) {
                tab.classList.add('active');
            }
        });

        // 懒加载工作表数据
        this.loadSheetData(workbook, sheetName);
    }

    async loadSheetData(workbook, sheetName) {
        // 检查数据缓存
        const cacheKey = `sheet-${this.currentFile?.name}-${sheetName}`;
        
        if (this.dataCache.has(cacheKey)) {
            const cached = this.dataCache.get(cacheKey);
            if (Date.now() - cached.timestamp < 300000) { // 5分钟缓存
                console.log('使用缓存的工作表数据:', sheetName);
                this.currentData = cached.data;
                this.renderTable(cached.data);
                this.showTableControls();
                return;
            }
        }

        this.showProgressLoading(0, `正在加载工作表: ${sheetName}`);

        // 异步处理大工作表
        const worksheet = workbook.Sheets[sheetName];
        const range = worksheet['!ref'];
        
        if (range && this.isLargeSheet(range)) {
            // 大工作表分批处理
            await this.loadLargeSheetData(worksheet, sheetName, cacheKey);
        } else {
            // 小工作表直接处理
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                header: 1,
                raw: false,
                dateNF: 'yyyy-mm-dd hh:mm:ss'
            });
            
            this.currentData = jsonData;
            this.cacheSheetData(cacheKey, jsonData);
            this.renderTable(jsonData);
            this.showTableControls();
        }
    }

    isLargeSheet(range) {
        if (!range) return false;
        const match = range.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);
        if (match) {
            const rows = parseInt(match[4]) - parseInt(match[2]) + 1;
            const cols = this.columnToNumber(match[3]) - this.columnToNumber(match[1]) + 1;
            return rows * cols > 10000; // 超过1万个单元格认为是大工作表
        }
        return false;
    }

    columnToNumber(col) {
        let result = 0;
        for (let i = 0; i < col.length; i++) {
            result = result * 26 + (col.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
        }
        return result;
    }

    async loadLargeSheetData(worksheet, sheetName, cacheKey) {
        return new Promise((resolve) => {
            let progress = 0;
            const batchSize = 1000;
            
            const processInBatches = () => {
                const startTime = Date.now();
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                    header: 1,
                    raw: false,
                    dateNF: 'yyyy-mm-dd hh:mm:ss'
                });
                
                progress = 100;
                this.showProgressLoading(progress, '数据加载完成');
                
                this.currentData = jsonData;
                this.cacheSheetData(cacheKey, jsonData);
                this.renderTable(jsonData);
                this.showTableControls();
                
                console.log(`大工作表加载耗时: ${Date.now() - startTime}ms`);
                resolve();
            };

            // 使用setTimeout让出主线程控制权
            setTimeout(processInBatches, 10);
        });
    }

    cacheSheetData(cacheKey, data) {
        // 限制缓存大小
        if (this.dataCache.size > 5) {
            const oldestKey = this.dataCache.keys().next().value;
            this.dataCache.delete(oldestKey);
            console.log('清理旧的工作表缓存:', oldestKey);
        }
        
        this.dataCache.set(cacheKey, {
            data: data,
            timestamp: Date.now(),
            size: this.estimateObjectSize(data)
        });
        
        console.log('缓存工作表数据:', cacheKey, `大小: ${Math.round(this.estimateObjectSize(data)/1024)}KB`);
    }

    renderTable(data) {
        const container = document.getElementById('tableContainer');
        
        if (!data || data.length === 0) {
            container.innerHTML = '<div class="placeholder"><p>该工作表没有数据</p></div>';
            this.hidePagination();
            return;
        }

        this.totalRows = data.length - 1; // 减去标题行

        // 根据数据量选择渲染策略
        if (this.totalRows > 10000) {
            // 大数据量使用分页
            this.enablePagination();
            this.renderPaginatedData();
        } else if (this.totalRows > 1000) {
            // 中等数据量使用虚拟滚动
            this.hidePagination();
            this.renderVirtualTableSetup(data);
            this.enableVirtualScrolling();
        } else {
            // 小数据量直接渲染
            this.hidePagination();
            this.renderRegularTable(data);
        }
    }

    enablePagination() {
        this.paginationEnabled = true;
        const paginationControl = document.getElementById('paginationControl');
        paginationControl.style.display = 'flex';
        this.updatePaginationInfo();
    }

    hidePagination() {
        this.paginationEnabled = false;
        const paginationControl = document.getElementById('paginationControl');
        paginationControl.style.display = 'none';
    }

    renderPaginatedData() {
        const currentData = this.getCurrentData();
        if (!currentData || !this.paginationEnabled) return;

        const headers = currentData[0] || [];
        const allRows = currentData.slice(1);
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = Math.min(startIndex + this.pageSize, allRows.length);
        
        // 检查分页缓存
        const cacheKey = `page-${this.currentSheet}-${this.currentPage}-${this.pageSize}`;
        if (this.renderCache.has(cacheKey)) {
            const cached = this.renderCache.get(cacheKey);
            if (Date.now() - cached.timestamp < 60000) { // 1分钟缓存
                document.getElementById('tableContainer').innerHTML = cached.html;
                this.updatePaginationInfo();
                this.updatePaginationButtons();
                return;
            }
        }
        
        const pageRows = allRows.slice(startIndex, endIndex);
        this.renderRegularTable([headers, ...pageRows]);
        
        // 缓存分页结果
        this.renderCache.set(cacheKey, {
            html: document.getElementById('tableContainer').innerHTML,
            timestamp: Date.now()
        });
        
        this.updatePaginationInfo();
        this.updatePaginationButtons();
    }

    updatePaginationInfo() {
        const totalPages = Math.ceil(this.totalRows / this.pageSize);
        const pageInfo = document.getElementById('pageInfo');
        pageInfo.textContent = `第${this.currentPage}页 / 共${totalPages}页 (共${this.totalRows}条)`;
    }

    updatePaginationButtons() {
        const totalPages = Math.ceil(this.totalRows / this.pageSize);
        const firstPage = document.getElementById('firstPage');
        const prevPage = document.getElementById('prevPage');
        const nextPage = document.getElementById('nextPage');
        const lastPage = document.getElementById('lastPage');

        firstPage.disabled = this.currentPage === 1;
        prevPage.disabled = this.currentPage === 1;
        nextPage.disabled = this.currentPage === totalPages;
        lastPage.disabled = this.currentPage === totalPages;
    }

    renderRegularTable(data) {
        const container = document.getElementById('tableContainer');
        const headers = data[0] || [];
        const rows = data.slice(1);

        // 使用DocumentFragment减少DOM重排
        const fragment = document.createDocumentFragment();
        const table = document.createElement('table');
        table.className = 'data-table';
        
        // 创建表头
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
        headers.forEach(header => {
            const th = document.createElement('th');
            th.textContent = header || '';
            headerRow.appendChild(th);
        });
        
        thead.appendChild(headerRow);
        table.appendChild(thead);
        
        // 创建表体
        const tbody = document.createElement('tbody');
        
        // 批量创建行以减少重排
        const batchSize = 100;
        let currentBatch = 0;
        
        const addBatch = () => {
            const start = currentBatch * batchSize;
            const end = Math.min(start + batchSize, rows.length);
            
            for (let i = start; i < end; i++) {
                const row = rows[i];
                const tr = this.createTableRow(row, i, headers);
                tbody.appendChild(tr);
            }
            
            currentBatch++;
            
            if (end < rows.length) {
                // 使用requestAnimationFrame进行下一批处理
                requestAnimationFrame(addBatch);
            } else {
                // 完成所有行的添加
                table.appendChild(tbody);
                fragment.appendChild(table);
                
                // 一次性更新DOM
                container.innerHTML = '';
                container.appendChild(fragment);
            }
        };
        
        if (rows.length > 0) {
            addBatch();
        } else {
            table.appendChild(tbody);
            fragment.appendChild(table);
            container.innerHTML = '';
            container.appendChild(fragment);
        }
    }

    createTableRow(row, rowIndex, headers) {
        const tr = document.createElement('tr');
        tr.setAttribute('data-row-index', rowIndex.toString());
        
        // 检查是否为冻结行
        const isFrozen = rowIndex < this.frozenRows;
        if (isFrozen) {
            tr.className = 'frozen-row';
            tr.style.top = this.calculateStickyTop(rowIndex) + 'px';
        }
        
        headers.forEach((_, cellIndex) => {
            const cellValue = row[cellIndex] || '';
            const formattedValue = this.formatCellValue(cellValue);
            const escapedValue = this.escapeHtml(formattedValue);
            
            const td = document.createElement('td');
            td.textContent = escapedValue;
            td.title = escapedValue;
            tr.appendChild(td);
        });
        
        return tr;
    }

    renderVirtualTableSetup(data) {
        const container = document.getElementById('tableContainer');
        const headers = data[0] || [];
        const totalRows = data.length - 1;
        const totalHeight = totalRows * this.rowHeight;

        container.innerHTML = `
            <div class="virtual-scroll-wrapper" style="height: ${totalHeight}px; position: relative;">
                <table class="data-table" style="position: absolute; top: 0; left: 0; width: 100%;">
                    <thead style="position: sticky; top: 0; z-index: 10;">
                        <tr>
                            ${headers.map(header => `<th>${this.escapeHtml(header || '')}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody id="virtualTableBody">
                    </tbody>
                </table>
            </div>
        `;

        this.renderVirtualTable();
    }

    renderVirtualTable() {
        const currentData = this.getCurrentData();
        if (!currentData || !this.virtualScrollEnabled) return;

        const container = document.getElementById('tableContainer');
        const tbody = document.getElementById('virtualTableBody');
        if (!tbody || !container) return;

        const scrollTop = container.scrollTop;
        const headers = currentData[0] || [];
        const rows = currentData.slice(1);
        
        const startRow = Math.max(0, Math.floor(scrollTop / this.rowHeight) - 5);
        const endRow = Math.min(rows.length, startRow + this.visibleRows + 10);
        
        // 检查渲染缓存
        const cacheKey = `${this.currentSheet}-${startRow}-${endRow}`;
        if (this.renderCache.has(cacheKey)) {
            const cached = this.renderCache.get(cacheKey);
            if (Date.now() - cached.timestamp < 30000) { // 30秒缓存
                tbody.innerHTML = cached.html;
                return;
            }
        }
        
        const visibleRows = rows.slice(startRow, endRow);
        const offsetY = startRow * this.rowHeight;

        const html = visibleRows.map((row, index) => {
            const actualRowIndex = startRow + index;
            return `
                <tr style="transform: translateY(${offsetY + (index * this.rowHeight)}px);" data-row-index="${actualRowIndex}">
                    ${headers.map((_, cellIndex) => {
                        const cellValue = row[cellIndex] || '';
                        const formattedValue = this.formatCellValue(cellValue);
                        return `<td title="${this.escapeHtml(formattedValue)}">${this.escapeHtml(formattedValue)}</td>`;
                    }).join('')}
                </tr>
            `;
        }).join('');

        tbody.innerHTML = html;
        
        // 缓存渲染结果
        this.renderCache.set(cacheKey, {
            html: html,
            timestamp: Date.now()
        });
        
        // 限制缓存大小
        if (this.renderCache.size > 20) {
            const oldestKey = this.renderCache.keys().next().value;
            this.renderCache.delete(oldestKey);
        }
    }

    formatCellValue(value) {
        if (value === null || value === undefined || value === '') {
            return '';
        }

        if (value instanceof Date) {
            return this.formatDate(value);
        }

        if (typeof value === 'number' && this.isExcelDate(value)) {
            const date = XLSX.SSF.parse_date_code(value);
            if (date) {
                return this.formatDate(new Date(date.y, date.m - 1, date.d, date.H || 0, date.M || 0, date.S || 0));
            }
        }

        if (typeof value === 'string' && this.isDateString(value)) {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
                return this.formatDate(date);
            }
        }

        return value.toString();
    }

    isExcelDate(value) {
        return typeof value === 'number' && value > 25569 && value < 2958465;
    }

    isDateString(value) {
        const datePatterns = [
            /^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}$/,
            /^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s+\d{1,2}:\d{1,2}:\d{1,2}$/,
            /^\d{1,2}[-\/]\d{1,2}[-\/]\d{4}$/,
            /^\d{1,2}[-\/]\d{1,2}[-\/]\d{4}\s+\d{1,2}:\d{1,2}:\d{1,2}$/
        ];
        return datePatterns.some(pattern => pattern.test(value));
    }

    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');

        if (hours === '00' && minutes === '00' && seconds === '00') {
            return `${year}-${month}-${day}`;
        } else {
            return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        }
    }

    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.toString().replace(/[&<>"']/g, m => map[m]);
    }

    clearDisplay() {
        document.getElementById('tabs').innerHTML = '';
        document.getElementById('tableContainer').innerHTML = 
            '<div class="placeholder"><p>请选择Excel文件查看数据</p></div>';
        this.currentWorkbook = null;
        this.currentData = null;
        this.hideTableControls();
    }

    showTableControls() {
        const controls = document.getElementById('tableControls');
        const controlsBar = document.getElementById('tableControlsBar');
        controls.classList.add('show');
        if (controlsBar) {
            controlsBar.style.display = 'block';
        }
    }

    hideTableControls() {
        const controls = document.getElementById('tableControls');
        const controlsBar = document.getElementById('tableControlsBar');
        controls.classList.remove('show');
        if (controlsBar) {
            controlsBar.style.display = 'none';
        }
    }

    renderTableRow(row, rowIndex, headers) {
        const isFrozen = rowIndex < this.frozenRows;
        
        if (isFrozen) {
            const stickyTop = this.calculateStickyTop(rowIndex);
            return `
                <tr class="frozen-row" style="top: ${stickyTop}px;" data-row-index="${rowIndex}">
                    ${headers.map((_, index) => {
                        const cellValue = row[index] || '';
                        const formattedValue = this.formatCellValue(cellValue);
                        return `<td title="${this.escapeHtml(formattedValue)}">${this.escapeHtml(formattedValue)}</td>`;
                    }).join('')}
                </tr>
            `;
        } else {
            return `
                <tr data-row-index="${rowIndex}">
                    ${headers.map((_, index) => {
                        const cellValue = row[index] || '';
                        const formattedValue = this.formatCellValue(cellValue);
                        return `<td title="${this.escapeHtml(formattedValue)}">${this.escapeHtml(formattedValue)}</td>`;
                    }).join('')}
                </tr>
            `;
        }
    }

    calculateStickyTop(rowIndex) {
        const headerHeight = 49;
        const rowHeight = 49;
        return headerHeight + (rowIndex * rowHeight);
    }

    updateFrozenRows() {
        if (this.currentData) {
            this.renderTable(this.currentData);
            this.showFreezeMessage();
            this.ensureFrozenRowsPosition();
        }
    }

    ensureFrozenRowsPosition() {
        setTimeout(() => {
            const container = document.getElementById('tableContainer');
            if (container && this.frozenRows > 0) {
                container.scrollTop = Math.max(0, this.frozenRows * 49);
                setTimeout(() => {
                    container.scrollTop = 0;
                }, 10);
            }
        }, 50);
    }

    showFreezeMessage() {
        const container = document.getElementById('tableContainer');
        const existingMessage = container.querySelector('.freeze-message');
        if (existingMessage) {
            existingMessage.remove();
        }

        if (this.frozenRows > 0) {
            const message = document.createElement('div');
            message.className = 'freeze-message';
            message.textContent = `已冻结前 ${this.frozenRows} 行`;
            message.style.cssText = `
                position: absolute;
                top: 10px;
                right: 10px;
                background: #007bff;
                color: white;
                padding: 5px 10px;
                border-radius: 15px;
                font-size: 12px;
                z-index: 1000;
                animation: fadeInOut 2s ease-in-out;
            `;
            
            container.style.position = 'relative';
            container.appendChild(message);
            
            setTimeout(() => {
                if (message.parentNode) {
                    message.remove();
                }
            }, 2000);
        }
    }

    showLoading() {
        const container = document.getElementById('tableContainer');
        container.innerHTML = '<div class="loading">正在加载文件...</div>';
    }

    showProgressLoading(progress, message, subMessage = '') {
        const container = document.getElementById('tableContainer');
        const estimatedTime = this.calculateEstimatedTime(progress);
        
        container.innerHTML = `
            <div class="progress-container">
                <div class="progress-icon">
                    <div class="progress-spinner"></div>
                </div>
                <div class="progress-content">
                    <div class="progress-message">${message}</div>
                    ${subMessage ? `<div class="progress-sub-message">${subMessage}</div>` : ''}
                    <div class="progress-bar-container">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${progress}%">
                                <div class="progress-shimmer"></div>
                            </div>
                        </div>
                        <div class="progress-stats">
                            <span class="progress-percentage">${Math.round(progress)}%</span>
                            ${estimatedTime ? `<span class="progress-eta">${estimatedTime}</span>` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    calculateEstimatedTime(progress) {
        if (!this.processingStartTime || progress <= 5) return '';
        
        const elapsed = Date.now() - this.processingStartTime;
        const remaining = (elapsed / progress) * (100 - progress);
        
        if (remaining < 1000) return '';
        if (remaining < 60000) return `约${Math.round(remaining/1000)}秒`;
        return `约${Math.round(remaining/60000)}分钟`;
    }

    showError(message) {
        const container = document.getElementById('tableContainer');
        container.innerHTML = `<div class="error">${message}</div>`;
        setTimeout(() => {
            if (container.innerHTML.includes(message)) {
                container.innerHTML = '<div class="placeholder"><p>请选择Excel文件查看数据</p></div>';
            }
        }, 3000);
    }

    showEnhancedError(message, fileName = '', suggestions = []) {
        const container = document.getElementById('tableContainer');
        
        // 根据错误类型提供建议
        const defaultSuggestions = this.getErrorSuggestions(message, fileName);
        const allSuggestions = [...suggestions, ...defaultSuggestions];
        
        container.innerHTML = `
            <div class="enhanced-error">
                <div class="error-icon">❌</div>
                <div class="error-content">
                    <h3>处理失败</h3>
                    <p class="error-message">${message}</p>
                    ${fileName ? `<p class="error-file">文件: ${fileName}</p>` : ''}
                    ${allSuggestions.length > 0 ? `
                        <div class="error-suggestions">
                            <p class="suggestions-title">建议解决方案:</p>
                            <ul>
                                ${allSuggestions.map(s => `<li>${s}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                    <div class="error-actions">
                        <button class="retry-btn" onclick="excelViewer.clearError()">重新选择文件</button>
                    </div>
                </div>
            </div>
        `;
    }

    getErrorSuggestions(message, fileName) {
        const suggestions = [];
        const lowerMessage = message.toLowerCase();
        const ext = fileName.toLowerCase().split('.').pop();
        
        if (lowerMessage.includes('格式') || lowerMessage.includes('format')) {
            suggestions.push('确保文件格式正确（支持 .xlsx, .xls, .csv）');
            if (ext === 'csv') {
                suggestions.push('如果是CSV文件，请确保使用UTF-8编码');
            }
        }
        
        if (lowerMessage.includes('大小') || lowerMessage.includes('size')) {
            suggestions.push('文件过大，请尝试以下方法:');
            suggestions.push('• 分割成多个较小的文件');
            suggestions.push('• 删除不必要的数据和格式');
        }
        
        if (lowerMessage.includes('编码') || lowerMessage.includes('encoding')) {
            suggestions.push('尝试将文件保存为UTF-8编码格式');
            suggestions.push('使用Excel另存为功能重新保存文件');
        }
        
        if (lowerMessage.includes('损坏') || lowerMessage.includes('corrupt')) {
            suggestions.push('文件可能已损坏，请尝试:');
            suggestions.push('• 重新下载原文件');
            suggestions.push('• 用Excel打开后另存为新文件');
        }
        
        return suggestions;
    }

    clearError() {
        const container = document.getElementById('tableContainer');
        container.innerHTML = '<div class="placeholder"><p>请选择Excel文件查看数据</p></div>';
        
        // 重置上传区域
        this.hideUploadProgress();
    }

    showSuccess(message) {
        const container = document.getElementById('tableContainer');
        const currentContent = container.innerHTML;
        container.innerHTML = `<div class="success">${message}</div>` + currentContent;
        setTimeout(() => {
            const successDiv = container.querySelector('.success');
            if (successDiv) {
                successDiv.remove();
            }
        }, 3000);
    }

    startMemoryMonitoring() {
        // 自适应内存检查频率
        this.cleanupInterval = setInterval(() => {
            this.checkMemoryAndCleanup();
            this.adjustMemoryCheckFrequency();
        }, this.memoryCheckInterval);
        
        // 监听页面卸载，清理资源
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
        
        // 监听页面隐藏，触发清理
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.performLightCleanup();
            }
        });
    }

    adjustMemoryCheckFrequency() {
        const ratio = this.memoryManager.getMemoryRatio();
        
        if (ratio > 0.8) {
            // 高内存使用时加快检查频率
            this.memoryCheckInterval = 5000; // 5秒
        } else if (ratio > 0.6) {
            this.memoryCheckInterval = 15000; // 15秒
        } else {
            this.memoryCheckInterval = 30000; // 30秒
        }
        
        // 重置定时器
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = setInterval(() => {
            this.checkMemoryAndCleanup();
            this.adjustMemoryCheckFrequency();
        }, this.memoryCheckInterval);
    }
    
    checkMemoryAndCleanup() {
        const now = Date.now();
        
        // 避免过于频繁的检查
        if (now - this.lastMemoryCheck < 3000) {
            return;
        }
        
        this.lastMemoryCheck = now;
        
        if (this.memoryManager.isMemoryCritical()) {
            console.warn('内存使用达到临界点，执行紧急清理');
            this.performEmergencyCleanup();
        } else if (this.memoryManager.shouldCleanup()) {
            console.log('执行定期内存清理');
            this.performRegularCleanup();
        }
        
        this.logMemoryUsage();
    }

    performEmergencyCleanup() {
        // 紧急情况：清理所有可清理的资源
        this.clearAllCaches();
        this.releaseInactiveData();
        this.optimizeCurrentDisplay();
        this.memoryManager.forceGarbageCollection();
        
        // 降级到最基本的功能
        this.disableNonEssentialFeatures();
        
        this.showMemoryWarning('内存不足，已自动优化显示');
    }

    performRegularCleanup() {
        // 常规清理
        this.clearOldCacheEntries();
        this.optimizeDataStorage();
        this.cleanupDOM();
    }

    performLightCleanup() {
        // 轻量清理（页面隐藏时）
        this.clearRenderCache();
        if (this.worker) {
            this.worker.postMessage({ type: 'CLEANUP' });
        }
    }

    clearAllCaches() {
        this.dataCache.clear();
        this.renderCache.clear();
        console.log('已清空所有缓存');
    }

    clearOldCacheEntries() {
        const maxAge = 300000; // 5分钟
        const now = Date.now();
        
        for (const [key, value] of this.dataCache.entries()) {
            if (value.timestamp && now - value.timestamp > maxAge) {
                this.dataCache.delete(key);
            }
        }
        
        for (const [key, value] of this.renderCache.entries()) {
            if (value.timestamp && now - value.timestamp > maxAge) {
                this.renderCache.delete(key);
            }
        }
    }

    clearRenderCache() {
        this.renderCache.clear();
    }

    releaseInactiveData() {
        // 释放非当前工作表的数据
        if (this.currentWorkbook && this.currentSheet) {
            const sheetsToRelease = Object.keys(this.currentWorkbook.Sheets)
                .filter(name => name !== this.currentSheet);
            
            sheetsToRelease.forEach(sheetName => {
                if (this.currentWorkbook.Sheets[sheetName]) {
                    // 只保留基本结构，清空数据
                    this.currentWorkbook.Sheets[sheetName] = { '!ref': 'A1' };
                }
            });
        }
    }

    optimizeCurrentDisplay() {
        // 优化当前显示，减少DOM节点
        if (this.totalRows > 1000 && !this.paginationEnabled) {
            // 强制启用分页
            this.pageSize = 100; // 减小页面大小
            this.enablePagination();
            this.renderPaginatedData();
        }
    }

    optimizeDataStorage() {
        if (this.currentData && this.currentData.length > 1000) {
            // 压缩数据存储
            const compressed = DataCompressor.compressStringArray(this.currentData);
            if (compressed.compressedSize < compressed.originalSize * 0.8) {
                console.log(`数据压缩: ${Math.round(compressed.originalSize/1024)}KB -> ${Math.round(compressed.compressedSize/1024)}KB`);
                this.currentDataCompressed = compressed;
                this.currentData = null; // 释放原始数据
            }
        }
    }

    getCurrentData() {
        if (this.currentDataCompressed) {
            return DataCompressor.decompressStringArray(this.currentDataCompressed);
        }
        return this.currentData;
    }

    cleanupDOM() {
        // 清理无用的DOM元素
        const container = document.getElementById('tableContainer');
        if (container) {
            const tables = container.querySelectorAll('table:not(.data-table)');
            tables.forEach(table => table.remove());
            
            // 清理过期的提示信息
            const oldMessages = container.querySelectorAll('.success, .error, .freeze-message');
            oldMessages.forEach(msg => {
                if (Date.now() - (parseInt(msg.dataset.timestamp) || 0) > 5000) {
                    msg.remove();
                }
            });
        }
    }

    disableNonEssentialFeatures() {
        // 在内存紧张时禁用非必要功能
        this.virtualScrollEnabled = false;
        
        // 禁用冻结行功能
        const freezeControls = document.querySelectorAll('#applyFreeze, #clearFreeze, #freezeRows');
        freezeControls.forEach(control => {
            control.disabled = true;
            control.title = '内存不足，功能已禁用';
        });
    }

    showMemoryWarning(message) {
        const container = document.getElementById('tableContainer');
        const warning = document.createElement('div');
        warning.className = 'memory-warning';
        warning.innerHTML = `
            <div style="background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; 
                        padding: 10px; margin: 10px 0; border-radius: 5px; font-size: 14px;">
                ⚠️ ${message}
            </div>
        `;
        
        if (container.firstChild) {
            container.insertBefore(warning, container.firstChild);
        }
        
        setTimeout(() => warning.remove(), 8000);
    }

    logMemoryUsage() {
        const usage = this.memoryManager.getMemoryUsage();
        if (usage) {
            const ratio = this.memoryManager.getMemoryRatio();
            const percentage = Math.round(ratio * 100);
            
            console.log(`内存使用: ${Math.round(usage.used/1024/1024)}MB / ${Math.round(usage.limit/1024/1024)}MB (${percentage}%)`);
            
            // 更新内存指示器
            this.updateMemoryIndicator(ratio, usage);
            
            // 根据内存使用情况应用不同策略
            this.applyMemoryStrategy(ratio);
        }
    }

    getCachedElement(id) {
        if (!this.domCache[id]) {
            this.domCache[id] = document.getElementById(id);
        }
        return this.domCache[id];
    }
    
    updateMemoryIndicator(ratio, usage) {
        const indicator = this.getCachedElement('memoryIndicator');
        const fill = this.getCachedElement('memoryFill');
        const text = this.getCachedElement('memoryText');
        
        if (!indicator || !fill || !text) return;
        
        const percentage = Math.round(ratio * 100);
        
        // 只有在内存使用率超过40%或存在内存压力时才显示指示器
        if (ratio > 0.4 || this.memoryManager.shouldCleanup()) {
            indicator.style.display = 'flex';
            
            // 更新进度条
            fill.style.width = `${percentage}%`;
            fill.className = 'memory-fill';
            
            if (ratio > 0.9) {
                fill.classList.add('critical');
            } else if (ratio > 0.8) {
                fill.classList.add('warning');
            }
            
            // 更新文本
            text.textContent = `内存: ${percentage}% (${Math.round(usage.used/1024/1024)}MB)`;
        } else {
            // 内存使用率正常时隐藏指示器
            indicator.style.display = 'none';
        }
    }

    applyMemoryStrategy(ratio) {
        if (ratio > 0.95) {
            // 极端情况：激进清理
            this.applyAggressiveStrategy();
        } else if (ratio > 0.9) {
            // 紧急情况：紧急清理
            this.performEmergencyCleanup();
        } else if (ratio > 0.8) {
            // 预警：温和清理
            this.applyWarningStrategy();
        } else if (ratio > 0.6) {
            // 正常：预防性清理
            this.applyPreventiveStrategy();
        }
    }

    applyAggressiveStrategy() {
        console.warn('应用激进内存清理策略');
        
        // 1. 立即清空所有缓存
        this.clearAllCaches();
        
        // 2. 释放所有非当前数据
        this.releaseAllInactiveData();
        
        // 3. 强制最小化显示
        this.forceMinimalDisplay();
        
        // 4. 禁用所有非核心功能
        this.disableAllNonEssentialFeatures();
        
        // 5. 强制垃圾回收
        this.memoryManager.forceGarbageCollection();
        
        this.showMemoryWarning('内存严重不足，已启用最小化模式');
    }

    applyWarningStrategy() {
        console.log('应用预警内存策略');
        
        // 1. 清理过期缓存
        this.clearOldCacheEntries();
        
        // 2. 压缩当前数据
        this.optimizeDataStorage();
        
        // 3. 减少页面大小
        if (this.paginationEnabled && this.pageSize > 100) {
            this.pageSize = 100;
            document.getElementById('pageSize').value = '100';
            this.renderPaginatedData();
        }
        
        // 4. 启用虚拟滚动
        if (!this.virtualScrollEnabled && this.totalRows > 500) {
            this.enableVirtualScrolling();
        }
        
        this.showMemoryWarning('内存使用偏高，已自动优化');
    }

    applyPreventiveStrategy() {
        // 预防性措施
        this.clearOldCacheEntries();
        this.cleanupDOM();
        
        // 限制缓存大小
        if (this.renderCache.size > 10) {
            const keysToDelete = Array.from(this.renderCache.keys()).slice(0, 5);
            keysToDelete.forEach(key => this.renderCache.delete(key));
        }
    }

    releaseAllInactiveData() {
        // 释放所有非当前工作表数据
        if (this.currentWorkbook) {
            Object.keys(this.currentWorkbook.Sheets).forEach(sheetName => {
                if (sheetName !== this.currentSheet) {
                    this.currentWorkbook.Sheets[sheetName] = null;
                }
            });
        }
        
        // 清理压缩数据
        if (this.currentDataCompressed && this.currentData) {
            this.currentData = null; // 只保留压缩版本
        }
    }

    forceMinimalDisplay() {
        // 强制使用最小分页大小
        this.pageSize = 50;
        document.getElementById('pageSize').value = '50';
        
        // 禁用虚拟滚动，使用分页
        this.virtualScrollEnabled = false;
        
        if (!this.paginationEnabled) {
            this.enablePagination();
        }
        
        this.renderPaginatedData();
    }

    disableAllNonEssentialFeatures() {
        // 禁用所有非必要功能
        this.disableNonEssentialFeatures();
        
        // 禁用文件多选
        const fileInput = document.getElementById('fileInput');
        fileInput.removeAttribute('multiple');
        
        // 隐藏内存指示器
        const indicator = document.getElementById('memoryIndicator');
        indicator.style.display = 'none';
    }

    cleanup() {
        // 清理所有资源
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        
        this.clearAllCaches();
        this.currentData = null;
        this.currentDataCompressed = null;
        this.currentWorkbook = null;
        
        // 清理DOM缓存
        this.domCache = {};
    }
}

// 内存管理器类
class MemoryManager {
    constructor() {
        this.memoryLimit = 512 * 1024 * 1024; // 512MB限制
        this.warningThreshold = 0.8; // 80%预警
        this.criticalThreshold = 0.9; // 90%紧急
        this.lastCleanup = Date.now();
        this.cleanupInterval = 30000; // 30秒清理间隔
    }

    getMemoryUsage() {
        if ('memory' in performance && performance.memory) {
            return {
                used: performance.memory.usedJSHeapSize,
                total: performance.memory.totalJSHeapSize,
                limit: performance.memory.jsHeapSizeLimit
            };
        }
        // 对不支持的浏览器返回估算值
        return {
            used: this.estimateMemoryUsage(),
            total: 0,
            limit: 512 * 1024 * 1024 // 512MB 默认限制
        };
    }
    
    estimateMemoryUsage() {
        // 基于缓存大小估算内存使用
        let estimatedSize = 0;
        
        if (this.currentData) {
            estimatedSize += this.estimateObjectSize(this.currentData);
        }
        
        for (const [, value] of this.dataCache) {
            estimatedSize += value.size || 0;
        }
        
        return Math.max(estimatedSize, 50 * 1024 * 1024); // 最少50MB
    }

    getMemoryRatio() {
        const memory = this.getMemoryUsage();
        if (!memory) return 0;
        return memory.used / memory.limit;
    }

    shouldCleanup() {
        const now = Date.now();
        if (now - this.lastCleanup < this.cleanupInterval) {
            return false;
        }
        
        const ratio = this.getMemoryRatio();
        return ratio > this.warningThreshold;
    }

    isMemoryCritical() {
        const ratio = this.getMemoryRatio();
        return ratio > this.criticalThreshold;
    }

    forceGarbageCollection() {
        if (window.gc && typeof window.gc === 'function') {
            try {
                window.gc();
                console.log('手动触发垃圾回收');
            } catch (e) {
                console.warn('垃圾回收触发失败:', e);
            }
        } else {
            // 使用更温和的方式鼓励垃圾回收
            this.triggerGCHint();
        }
    }
    
    triggerGCHint() {
        // 创建一些临时对象然后清理，给GC一个提示
        const temp = [];
        for (let i = 0; i < 10000; i++) {
            temp.push(new Date().getTime());
        }
        temp.length = 0;
        
        // 清理事件监听器
        const tempDiv = document.createElement('div');
        tempDiv.addEventListener('click', () => {});
        tempDiv.removeEventListener('click', () => {});
    }
}

// 数据压缩工具
class DataCompressor {
    static compressStringArray(arr) {
        const uniqueStrings = new Set();
        const compressed = [];
        
        // 收集唯一字符串
        arr.forEach(row => {
            if (Array.isArray(row)) {
                row.forEach(cell => {
                    if (typeof cell === 'string' && cell.length > 10) {
                        uniqueStrings.add(cell);
                    }
                });
            }
        });
        
        // 创建字符串映射
        const stringMap = new Map();
        const reverseMap = new Map();
        let index = 0;
        
        uniqueStrings.forEach(str => {
            const key = `__STR_${index}__`;
            stringMap.set(str, key);
            reverseMap.set(key, str);
            index++;
        });
        
        // 压缩数据
        const compressedData = arr.map(row => {
            if (!Array.isArray(row)) return row;
            return row.map(cell => {
                if (typeof cell === 'string' && stringMap.has(cell)) {
                    return stringMap.get(cell);
                }
                return cell;
            });
        });
        
        return {
            data: compressedData,
            stringMap: reverseMap,
            originalSize: this.estimateSize(arr),
            compressedSize: this.estimateSize(compressedData) + this.estimateSize(Array.from(reverseMap.entries()))
        };
    }
    
    static decompressStringArray(compressed) {
        const { data, stringMap } = compressed;
        return data.map(row => {
            if (!Array.isArray(row)) return row;
            return row.map(cell => {
                if (typeof cell === 'string' && stringMap.has(cell)) {
                    return stringMap.get(cell);
                }
                return cell;
            });
        });
    }
    
    static estimateSize(obj) {
        return JSON.stringify(obj).length * 2; // 粗略估计（UTF-16）
    }
}

const excelViewer = new ExcelViewer();