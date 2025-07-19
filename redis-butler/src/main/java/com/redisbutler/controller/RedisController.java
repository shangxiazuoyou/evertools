package com.redisbutler.controller;

import com.redisbutler.config.RedisEnvironmentConfig;
import com.redisbutler.service.RedisConnectionManager;
import com.redisbutler.service.RedisService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * @author everflowx
 */
@RestController
@RequestMapping("/api/redis")
public class RedisController {
    
    @Autowired
    private RedisService redisService;
    
    @Autowired
    private RedisConnectionManager connectionManager;
    
    @Autowired
    private RedisEnvironmentConfig config;
    
    @GetMapping("/environments")
    public ResponseEntity<Map<String, Object>> getEnvironments() {
        Map<String, Object> result = new HashMap<>();
        result.put("environments", config.getEnvironments().keySet());
        return ResponseEntity.ok(result);
    }
    
    @PostMapping("/test-connection")
    public ResponseEntity<Map<String, Object>> testConnection(@RequestParam String environment) {
        Map<String, Object> result = new HashMap<>();
        try {
            boolean connected = connectionManager.testConnection(environment);
            result.put("success", connected);
            result.put("message", connected ? "连接成功" : "连接失败");
        } catch (Exception e) {
            result.put("success", false);
            result.put("message", "连接异常: " + e.getMessage());
        }
        return ResponseEntity.ok(result);
    }
    
    @GetMapping("/key")
    public ResponseEntity<Map<String, Object>> getKey(
            @RequestParam String environment,
            @RequestParam String key) {
        Map<String, Object> result = new HashMap<>();
        try {
            String value = redisService.get(environment, key);
            result.put("success", true);
            result.put("value", value);
        } catch (Exception e) {
            result.put("success", false);
            result.put("message", e.getMessage());
        }
        return ResponseEntity.ok(result);
    }
    
    @PostMapping("/key")
    public ResponseEntity<Map<String, Object>> setKey(
            @RequestParam String environment,
            @RequestParam String key,
            @RequestParam String value,
            @RequestParam(required = false) Long expire) {
        Map<String, Object> result = new HashMap<>();
        try {
            String response;
            if (expire != null && expire > 0) {
                response = redisService.setWithExpire(environment, key, value, expire);
            } else {
                response = redisService.set(environment, key, value);
            }
            result.put("success", true);
            result.put("response", response);
        } catch (Exception e) {
            result.put("success", false);
            result.put("message", e.getMessage());
        }
        return ResponseEntity.ok(result);
    }
    
    @DeleteMapping("/key")
    public ResponseEntity<Map<String, Object>> deleteKey(
            @RequestParam String environment,
            @RequestParam String key) {
        Map<String, Object> result = new HashMap<>();
        try {
            Long deleted = redisService.delete(environment, key);
            result.put("success", true);
            result.put("deleted", deleted);
        } catch (Exception e) {
            result.put("success", false);
            result.put("message", e.getMessage());
        }
        return ResponseEntity.ok(result);
    }
    
    @GetMapping("/keys")
    public ResponseEntity<Map<String, Object>> getKeys(
            @RequestParam String environment,
            @RequestParam(defaultValue = "*") String pattern) {
        Map<String, Object> result = new HashMap<>();
        try {
            List<String> keys = redisService.keys(environment, pattern);
            result.put("success", true);
            result.put("keys", keys);
            result.put("count", keys.size());
        } catch (Exception e) {
            result.put("success", false);
            result.put("message", e.getMessage());
        }
        return ResponseEntity.ok(result);
    }
    
    @GetMapping("/key-info")
    public ResponseEntity<Map<String, Object>> getKeyInfo(
            @RequestParam String environment,
            @RequestParam String key) {
        Map<String, Object> result = new HashMap<>();
        try {
            Map<String, Object> keyInfo = redisService.getKeyInfo(environment, key);
            result.put("success", true);
            result.put("data", keyInfo);
        } catch (Exception e) {
            result.put("success", false);
            result.put("message", e.getMessage());
        }
        return ResponseEntity.ok(result);
    }
    
    @PostMapping("/flush-db")
    public ResponseEntity<Map<String, Object>> flushDatabase(@RequestParam String environment) {
        Map<String, Object> result = new HashMap<>();
        try {
            String response = redisService.flushDatabase(environment);
            result.put("success", true);
            result.put("response", response);
        } catch (Exception e) {
            result.put("success", false);
            result.put("message", e.getMessage());
        }
        return ResponseEntity.ok(result);
    }
    
    @PostMapping("/batch-delete")
    public ResponseEntity<Map<String, Object>> batchDelete(
            @RequestParam String environment,
            @RequestParam String pattern) {
        Map<String, Object> result = new HashMap<>();
        try {
            List<String> keys = redisService.keys(environment, pattern);
            if (keys.isEmpty()) {
                result.put("success", true);
                result.put("deleted", 0);
                result.put("message", "没有找到匹配的Keys");
                return ResponseEntity.ok(result);
            }
            
            Long deleted = redisService.delete(environment, keys.toArray(new String[0]));
            result.put("success", true);
            result.put("deleted", deleted);
            result.put("total", keys.size());
            result.put("keys", keys);
        } catch (Exception e) {
            result.put("success", false);
            result.put("message", e.getMessage());
        }
        return ResponseEntity.ok(result);
    }
    
    @PostMapping("/batch-expire")
    public ResponseEntity<Map<String, Object>> batchExpire(
            @RequestParam String environment,
            @RequestParam String pattern,
            @RequestParam long seconds) {
        Map<String, Object> result = new HashMap<>();
        try {
            List<String> keys = redisService.keys(environment, pattern);
            if (keys.isEmpty()) {
                result.put("success", true);
                result.put("affected", 0);
                result.put("message", "没有找到匹配的Keys");
                return ResponseEntity.ok(result);
            }
            
            int affected = 0;
            for (String key : keys) {
                if (redisService.expire(environment, key, seconds)) {
                    affected++;
                }
            }
            
            result.put("success", true);
            result.put("affected", affected);
            result.put("total", keys.size());
            result.put("keys", keys);
        } catch (Exception e) {
            result.put("success", false);
            result.put("message", e.getMessage());
        }
        return ResponseEntity.ok(result);
    }
}