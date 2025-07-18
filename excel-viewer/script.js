class ExcelViewer {
    constructor() {
        this.files = [];
        this.currentFile = null;
        this.currentSheet = null;
        this.currentWorkbook = null;
        this.frozenRows = 1;
        this.currentData = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupFreezeControls();
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

    handleFiles(files) {
        Array.from(files).forEach(file => {
            if (this.isValidFile(file)) {
                this.addFile(file);
            } else {
                this.showError(`不支持的文件类型: ${file.name}`);
            }
        });
    }

    isValidFile(file) {
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
        this.files = this.files.filter(file => file.name !== fileName);
        this.renderFileList();
        
        if (this.currentFile && this.currentFile.name === fileName) {
            this.currentFile = null;
            this.currentSheet = null;
            this.currentWorkbook = null;
            this.clearDisplay();
        }
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
            this.showLoading();
            
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
            
        } catch (error) {
            console.error('文件处理错误:', error);
            this.showError(`文件处理失败: ${error.message}`);
        }
    }

    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('文件读取失败'));
            reader.readAsBinaryString(file);
        });
    }

    parseCSV(data) {
        const lines = data.split('\n');
        const result = [];
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
                const row = this.parseCSVLine(line);
                result.push(row);
            }
        }

        const worksheet = XLSX.utils.aoa_to_sheet(result);
        return {
            SheetNames: ['Sheet1'],
            Sheets: { 'Sheet1': worksheet }
        };
    }

    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current.trim());
        return result;
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

        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
            header: 1,
            raw: false,
            dateNF: 'yyyy-mm-dd hh:mm:ss'
        });
        
        this.currentData = jsonData;
        this.renderTable(jsonData);
        this.showTableControls();
    }

    renderTable(data) {
        const container = document.getElementById('tableContainer');
        
        if (!data || data.length === 0) {
            container.innerHTML = '<div class="placeholder"><p>该工作表没有数据</p></div>';
            return;
        }

        const headers = data[0] || [];
        const rows = data.slice(1);

        const table = `
            <table class="data-table">
                <thead>
                    <tr>
                        ${headers.map(header => `<th>${this.escapeHtml(header || '')}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${rows.map((row, rowIndex) => this.renderTableRow(row, rowIndex, headers)).join('')}
                </tbody>
            </table>
        `;

        container.innerHTML = table;
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
        controls.classList.add('show');
    }

    hideTableControls() {
        const controls = document.getElementById('tableControls');
        controls.classList.remove('show');
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

    showError(message) {
        const container = document.getElementById('tableContainer');
        container.innerHTML = `<div class="error">${message}</div>`;
        setTimeout(() => {
            if (container.innerHTML.includes(message)) {
                container.innerHTML = '<div class="placeholder"><p>请选择Excel文件查看数据</p></div>';
            }
        }, 3000);
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
}

const excelViewer = new ExcelViewer();