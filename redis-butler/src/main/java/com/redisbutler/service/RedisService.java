package com.redisbutler.service;

import io.lettuce.core.api.sync.RedisCommands;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * @author everflowx
 */
@Service
public class RedisService {
    
    @Autowired
    private RedisConnectionManager connectionManager;
    
    public String get(String environment, String key) {
        RedisCommands<String, String> commands = connectionManager.getConnection(environment);
        return commands.get(key);
    }
    
    public String set(String environment, String key, String value) {
        RedisCommands<String, String> commands = connectionManager.getConnection(environment);
        return commands.set(key, value);
    }
    
    public String setWithExpire(String environment, String key, String value, long seconds) {
        RedisCommands<String, String> commands = connectionManager.getConnection(environment);
        return commands.setex(key, seconds, value);
    }
    
    public Long delete(String environment, String... keys) {
        RedisCommands<String, String> commands = connectionManager.getConnection(environment);
        return commands.del(keys);
    }
    
    public Boolean exists(String environment, String key) {
        RedisCommands<String, String> commands = connectionManager.getConnection(environment);
        return commands.exists(key) > 0;
    }
    
    public Boolean expire(String environment, String key, long seconds) {
        RedisCommands<String, String> commands = connectionManager.getConnection(environment);
        return commands.expire(key, seconds);
    }
    
    public Long ttl(String environment, String key) {
        RedisCommands<String, String> commands = connectionManager.getConnection(environment);
        return commands.ttl(key);
    }
    
    public List<String> keys(String environment, String pattern) {
        RedisCommands<String, String> commands = connectionManager.getConnection(environment);
        return commands.keys(pattern);
    }
    
    public String type(String environment, String key) {
        RedisCommands<String, String> commands = connectionManager.getConnection(environment);
        return commands.type(key);
    }
    
    public Map<String, Object> getKeyInfo(String environment, String key) {
        RedisCommands<String, String> commands = connectionManager.getConnection(environment);
        
        Map<String, Object> info = new HashMap<>();
        info.put("key", key);
        info.put("exists", commands.exists(key) > 0);
        info.put("type", commands.type(key));
        info.put("ttl", commands.ttl(key));
        
        if ((Boolean) info.get("exists")) {
            String type = (String) info.get("type");
            switch (type) {
                case "string":
                    info.put("value", commands.get(key));
                    break;
                case "list":
                    info.put("length", commands.llen(key));
                    info.put("values", commands.lrange(key, 0, 10));
                    break;
                case "set":
                    info.put("size", commands.scard(key));
                    info.put("members", commands.smembers(key));
                    break;
                case "hash":
                    info.put("size", commands.hlen(key));
                    info.put("fields", commands.hgetall(key));
                    break;
                case "zset":
                    info.put("size", commands.zcard(key));
                    info.put("members", commands.zrange(key, 0, 10));
                    break;
            }
        }
        
        return info;
    }
    
    public Long flushdb(String environment) {
        RedisCommands<String, String> commands = connectionManager.getConnection(environment);
        return commands.dbsize();
    }
    
    public String flushDatabase(String environment) {
        RedisCommands<String, String> commands = connectionManager.getConnection(environment);
        return commands.flushdb();
    }
}