let currentEnvironment = '';
let selectedKey = '';

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    loadEnvironments();
});

// 加载环境列表
async function loadEnvironments() {
    try {
        const response = await fetch('/api/redis/environments');
        const data = await response.json();
        
        const select = document.getElementById('environmentSelect');
        select.innerHTML = '<option value="">选择环境...</option>';
        
        data.environments.forEach(env => {
            const option = document.createElement('option');
            option.value = env;
            option.textContent = env;
            select.appendChild(option);
        });
        
        select.addEventListener('change', function() {
            currentEnvironment = this.value;
            if (currentEnvironment) {
                testConnection();
            }
        });
    } catch (error) {
        showMessage('加载环境失败: ' + error.message, 'error');
    }
}

// 测试连接
async function testConnection() {
    if (!currentEnvironment) {
        showMessage('请先选择环境', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/redis/test-connection', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `environment=${encodeURIComponent(currentEnvironment)}`
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage(`环境 "${currentEnvironment}" 连接成功`, 'success');
            refreshKeys();
        } else {
            showMessage(`连接失败: ${data.message}`, 'error');
        }
    } catch (error) {
        showMessage('连接测试失败: ' + error.message, 'error');
    }
}

// 刷新Keys列表
async function refreshKeys() {
    const pattern = document.getElementById('searchPattern').value || '*';
    await searchKeys(pattern);
}

// 搜索Keys
async function searchKeys(pattern) {
    if (!currentEnvironment) {
        showMessage('请先选择环境', 'error');
        return;
    }
    
    pattern = pattern || document.getElementById('searchPattern').value || '*';
    
    try {
        const response = await fetch(`/api/redis/keys?environment=${encodeURIComponent(currentEnvironment)}&pattern=${encodeURIComponent(pattern)}`);
        const data = await response.json();
        
        if (data.success) {
            displayKeys(data.keys);
        } else {
            showMessage('搜索失败: ' + data.message, 'error');
        }
    } catch (error) {
        showMessage('搜索失败: ' + error.message, 'error');
    }
}

// 显示Keys列表
function displayKeys(keys) {
    const keysList = document.getElementById('keysList');
    
    if (keys.length === 0) {
        keysList.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">未找到匹配的Keys</div>';
        return;
    }
    
    keysList.innerHTML = '';
    
    keys.forEach(key => {
        const keyItem = document.createElement('div');
        keyItem.className = 'key-item';
        keyItem.innerHTML = `
            <span>${key}</span>
            <span class="key-type">string</span>
        `;
        
        keyItem.addEventListener('click', function() {
            // 清除之前的选中状态
            document.querySelectorAll('.key-item').forEach(item => {
                item.classList.remove('selected');
            });
            
            // 设置当前选中
            keyItem.classList.add('selected');
            selectedKey = key;
            document.getElementById('keyInput').value = key;
            
            // 自动获取值
            getValue();
        });
        
        keysList.appendChild(keyItem);
    });
    
    // 异步获取每个key的类型
    keys.forEach(async (key, index) => {
        try {
            const response = await fetch(`/api/redis/key-info?environment=${encodeURIComponent(currentEnvironment)}&key=${encodeURIComponent(key)}`);
            const data = await response.json();
            
            if (data.success && data.data.exists) {
                const keyItems = keysList.querySelectorAll('.key-item');
                if (keyItems[index]) {
                    const typeSpan = keyItems[index].querySelector('.key-type');
                    typeSpan.textContent = data.data.type;
                    typeSpan.style.background = getTypeColor(data.data.type);
                }
            }
        } catch (error) {
            console.warn('获取key类型失败:', error);
        }
    });
}

// 根据类型获取颜色
function getTypeColor(type) {
    const colors = {
        'string': '#3498db',
        'list': '#e74c3c',
        'set': '#2ecc71',
        'hash': '#f39c12',
        'zset': '#9b59b6'
    };
    return colors[type] || '#95a5a6';
}

// 获取Key的值
async function getValue() {
    const key = document.getElementById('keyInput').value;
    
    if (!currentEnvironment || !key) {
        showMessage('请选择环境并输入Key', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/redis/key?environment=${encodeURIComponent(currentEnvironment)}&key=${encodeURIComponent(key)}`);
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('valueInput').value = data.value || '';
            showMessage('获取成功', 'success');
        } else {
            showMessage('获取失败: ' + data.message, 'error');
        }
    } catch (error) {
        showMessage('获取失败: ' + error.message, 'error');
    }
}

// 设置Key的值
async function setValue() {
    const key = document.getElementById('keyInput').value;
    const value = document.getElementById('valueInput').value;
    const expire = document.getElementById('expireInput').value;
    
    if (!currentEnvironment || !key) {
        showMessage('请选择环境并输入Key', 'error');
        return;
    }
    
    try {
        let url = `/api/redis/key?environment=${encodeURIComponent(currentEnvironment)}&key=${encodeURIComponent(key)}&value=${encodeURIComponent(value)}`;
        if (expire && expire > 0) {
            url += `&expire=${expire}`;
        }
        
        const response = await fetch(url, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage('设置成功', 'success');
            refreshKeys();
        } else {
            showMessage('设置失败: ' + data.message, 'error');
        }
    } catch (error) {
        showMessage('设置失败: ' + error.message, 'error');
    }
}

// 删除Key
async function deleteKey() {
    const key = document.getElementById('keyInput').value;
    
    if (!currentEnvironment || !key) {
        showMessage('请选择环境并输入Key', 'error');
        return;
    }
    
    if (!confirm(`确定要删除Key "${key}" 吗？`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/redis/key?environment=${encodeURIComponent(currentEnvironment)}&key=${encodeURIComponent(key)}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage(`删除成功，共删除 ${data.deleted} 个Key`, 'success');
            document.getElementById('keyInput').value = '';
            document.getElementById('valueInput').value = '';
            refreshKeys();
        } else {
            showMessage('删除失败: ' + data.message, 'error');
        }
    } catch (error) {
        showMessage('删除失败: ' + error.message, 'error');
    }
}

// 获取Key详细信息
async function getKeyInfo() {
    const key = document.getElementById('keyInput').value;
    
    if (!currentEnvironment || !key) {
        showMessage('请选择环境并输入Key', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/redis/key-info?environment=${encodeURIComponent(currentEnvironment)}&key=${encodeURIComponent(key)}`);
        const data = await response.json();
        
        if (data.success) {
            showKeyInfo(data.data);
        } else {
            showMessage('获取信息失败: ' + data.message, 'error');
        }
    } catch (error) {
        showMessage('获取信息失败: ' + error.message, 'error');
    }
}

// 显示Key详细信息
function showKeyInfo(info) {
    const result = document.getElementById('operationResult');
    const jsonStr = JSON.stringify(info, null, 2);
    
    result.innerHTML = `
        <div style="margin-top: 15px;">
            <strong>Key详细信息:</strong>
            <div class="json-viewer">${jsonStr}</div>
        </div>
    `;
}

// 确认清空数据库
function confirmFlushDb() {
    if (!currentEnvironment) {
        showMessage('请先选择环境', 'error');
        return;
    }
    
    const confirmation = prompt(`危险操作确认！
    
这将清空环境 "${currentEnvironment}" 中当前数据库的所有数据！

请输入 "FLUSH ${currentEnvironment}" 来确认操作:`);
    
    if (confirmation === `FLUSH ${currentEnvironment}`) {
        flushDatabase();
    } else if (confirmation !== null) {
        showMessage('确认文本不匹配，操作已取消', 'error');
    }
}

// 清空数据库
async function flushDatabase() {
    try {
        const response = await fetch('/api/redis/flush-db', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `environment=${encodeURIComponent(currentEnvironment)}`
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage('数据库已清空', 'success');
            refreshKeys();
        } else {
            showMessage('清空失败: ' + data.message, 'error');
        }
    } catch (error) {
        showMessage('清空失败: ' + error.message, 'error');
    }
}

// 预览批量操作
async function previewBatchOperation() {
    const pattern = document.getElementById('batchPattern').value;
    
    if (!currentEnvironment || !pattern) {
        showMessage('请选择环境并输入匹配模式', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/redis/keys?environment=${encodeURIComponent(currentEnvironment)}&pattern=${encodeURIComponent(pattern)}`);
        const data = await response.json();
        
        if (data.success) {
            const result = document.getElementById('batchResult');
            
            if (data.keys.length === 0) {
                result.innerHTML = `
                    <div style="margin-top: 15px;">
                        <strong>预览结果:</strong>
                        <div class="status error">未找到匹配 "${pattern}" 的Keys</div>
                    </div>
                `;
            } else {
                const keysList = data.keys.slice(0, 10).map(key => `<li>${key}</li>`).join('');
                const moreText = data.keys.length > 10 ? `<li>... 还有 ${data.keys.length - 10} 个Keys</li>` : '';
                
                result.innerHTML = `
                    <div style="margin-top: 15px;">
                        <strong>预览结果 (共 ${data.keys.length} 个Keys):</strong>
                        <div style="background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; padding: 10px; margin-top: 10px;">
                            <ul style="margin: 0; padding-left: 20px;">
                                ${keysList}
                                ${moreText}
                            </ul>
                        </div>
                    </div>
                `;
            }
        } else {
            showMessage('预览失败: ' + data.message, 'error');
        }
    } catch (error) {
        showMessage('预览失败: ' + error.message, 'error');
    }
}

// 批量设置过期时间
async function batchExpire() {
    const pattern = document.getElementById('batchPattern').value;
    const seconds = document.getElementById('batchExpireSeconds').value;
    
    if (!currentEnvironment || !pattern || !seconds) {
        showMessage('请填写完整的批量操作信息', 'error');
        return;
    }
    
    if (!confirm(`确定要为所有匹配 "${pattern}" 的Keys设置 ${seconds} 秒过期时间吗？`)) {
        return;
    }
    
    try {
        const response = await fetch('/api/redis/batch-expire', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `environment=${encodeURIComponent(currentEnvironment)}&pattern=${encodeURIComponent(pattern)}&seconds=${seconds}`
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage(`批量设置过期成功：影响 ${data.affected}/${data.total} 个Keys`, 'success');
            const result = document.getElementById('batchResult');
            result.innerHTML = `
                <div style="margin-top: 15px;">
                    <strong>批量操作结果:</strong>
                    <div class="status success">
                        成功设置 ${data.affected} 个Keys的过期时间，总共 ${data.total} 个Keys
                    </div>
                </div>
            `;
        } else {
            showMessage('批量设置过期失败: ' + data.message, 'error');
        }
    } catch (error) {
        showMessage('批量设置过期失败: ' + error.message, 'error');
    }
}

// 确认批量删除
function confirmBatchDelete() {
    const pattern = document.getElementById('batchPattern').value;
    
    if (!currentEnvironment || !pattern) {
        showMessage('请选择环境并输入匹配模式', 'error');
        return;
    }
    
    const confirmation = prompt(`危险操作确认！

这将删除所有匹配 "${pattern}" 的Keys！

请输入 "DELETE ${pattern}" 来确认操作:`);
    
    if (confirmation === `DELETE ${pattern}`) {
        batchDelete(pattern);
    } else if (confirmation !== null) {
        showMessage('确认文本不匹配，操作已取消', 'error');
    }
}

// 批量删除
async function batchDelete(pattern) {
    try {
        const response = await fetch('/api/redis/batch-delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `environment=${encodeURIComponent(currentEnvironment)}&pattern=${encodeURIComponent(pattern)}`
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage(`批量删除成功：删除了 ${data.deleted} 个Keys`, 'success');
            const result = document.getElementById('batchResult');
            result.innerHTML = `
                <div style="margin-top: 15px;">
                    <strong>批量删除结果:</strong>
                    <div class="status success">
                        成功删除 ${data.deleted} 个Keys
                    </div>
                </div>
            `;
            refreshKeys();
        } else {
            showMessage('批量删除失败: ' + data.message, 'error');
        }
    } catch (error) {
        showMessage('批量删除失败: ' + error.message, 'error');
    }
}

// 显示消息
function showMessage(message, type) {
    const statusDiv = document.getElementById('connectionStatus');
    statusDiv.innerHTML = `<div class="status ${type}">${message}</div>`;
    
    // 3秒后自动隐藏
    setTimeout(() => {
        statusDiv.innerHTML = '';
    }, 3000);
}