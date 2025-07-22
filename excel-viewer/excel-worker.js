// Excel解析Worker
importScripts('xlsx.full.min.js');

self.onmessage = function(e) {
    const { type, data, fileName } = e.data;
    
    try {
        switch (type) {
            case 'PARSE_EXCEL':
                parseExcelFile(data, fileName);
                break;
            case 'PARSE_CSV':
                parseCSVFile(data, fileName);
                break;
            default:
                self.postMessage({
                    type: 'ERROR',
                    error: '未知的解析类型'
                });
        }
    } catch (error) {
        self.postMessage({
            type: 'ERROR',
            error: error.message
        });
    }
};

function parseExcelFile(data, fileName) {
    const startTime = Date.now();
    
    self.postMessage({
        type: 'PROGRESS',
        progress: 10,
        message: '正在读取文件...'
    });

    const workbook = XLSX.read(data, { 
        type: 'binary',
        cellDates: true,
        dateNF: 'yyyy-mm-dd hh:mm:ss'
    });

    self.postMessage({
        type: 'PROGRESS',
        progress: 50,
        message: '正在解析工作表...'
    });

    const result = {
        fileName,
        sheetNames: workbook.SheetNames,
        sheets: {}
    };

    // 逐个处理工作表
    workbook.SheetNames.forEach((sheetName, index) => {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
            header: 1,
            raw: false,
            dateNF: 'yyyy-mm-dd hh:mm:ss'
        });
        
        result.sheets[sheetName] = jsonData;
        
        const progress = 50 + Math.floor((index + 1) / workbook.SheetNames.length * 40);
        self.postMessage({
            type: 'PROGRESS',
            progress,
            message: `正在处理工作表: ${sheetName}`
        });
    });

    const endTime = Date.now();
    
    self.postMessage({
        type: 'COMPLETE',
        result,
        processingTime: endTime - startTime
    });
}

function parseCSVFile(data, fileName) {
    const startTime = Date.now();
    
    self.postMessage({
        type: 'PROGRESS',
        progress: 10,
        message: '正在分析CSV格式...'
    });

    try {
        // 检测分隔符和编码
        const delimiter = detectDelimiter(data);
        console.log('Worker检测到分隔符:', delimiter);
        
        self.postMessage({
            type: 'PROGRESS',
            progress: 20,
            message: '正在解析CSV数据...'
        });

        // 规范化换行符
        const normalizedData = data.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        
        // 使用改进的解析器
        const result = parseCSVStateMachine(normalizedData, delimiter);
        
        const endTime = Date.now();
        
        self.postMessage({
            type: 'COMPLETE',
            result: {
                fileName,
                sheetNames: ['Sheet1'],
                sheets: {
                    'Sheet1': result
                }
            },
            processingTime: endTime - startTime
        });
        
    } catch (error) {
        self.postMessage({
            type: 'ERROR',
            error: `CSV解析错误: ${error.message}`
        });
    }
}

function detectDelimiter(data) {
    const sample = data.substring(0, 1000);
    const delimiters = [',', ';', '\t', '|'];
    let bestDelimiter = ',';
    let maxScore = 0;
    
    for (const delimiter of delimiters) {
        const lines = sample.split('\n').slice(0, 5);
        const counts = lines.map(line => {
            const escaped = delimiter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return (line.match(new RegExp(escaped, 'g')) || []).length;
        });
        
        if (counts.length > 1) {
            const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
            const variance = counts.reduce((sum, count) => sum + Math.pow(count - avg, 2), 0) / counts.length;
            const consistency = 1 / (1 + variance);
            const score = avg * consistency;
            
            if (score > maxScore) {
                maxScore = score;
                bestDelimiter = delimiter;
            }
        }
    }
    
    return bestDelimiter;
}

function parseCSVStateMachine(data, delimiter) {
    const result = [];
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;
    let rowCount = 0;
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
            currentRow.push(cleanField(currentField));
            currentField = '';
            i++;
        } else if (char === '\n' && !inQuotes) {
            // 行结束
            currentRow.push(cleanField(currentField));
            if (currentRow.length > 0 && !isEmptyRow(currentRow)) {
                result.push([...currentRow]);
                rowCount++;
                
                // 每1000行报告进度
                if (rowCount % 1000 === 0) {
                    const progress = 20 + Math.floor((i / data.length) * 70);
                    self.postMessage({
                        type: 'PROGRESS',
                        progress,
                        message: `已解析 ${rowCount} 行`
                    });
                }
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
        currentRow.push(cleanField(currentField));
        if (!isEmptyRow(currentRow)) {
            result.push(currentRow);
        }
    }
    
    return result;
}

function cleanField(field) {
    let cleaned = field.trim();
    
    if (cleaned === '' || cleaned.toLowerCase() === 'null' || cleaned.toLowerCase() === 'n/a') {
        return '';
    }
    
    // 数字检测
    if (!isNaN(cleaned) && !isNaN(parseFloat(cleaned)) && cleaned !== '') {
        const num = parseFloat(cleaned);
        return isFinite(num) ? num : cleaned;
    }
    
    // 布尔值检测
    if (cleaned.toLowerCase() === 'true') return true;
    if (cleaned.toLowerCase() === 'false') return false;
    
    return cleaned;
}

function isEmptyRow(row) {
    return row.every(cell => !cell || cell.toString().trim() === '');
}