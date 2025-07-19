package com.redisbutler.service;

import com.redisbutler.config.RedisEnvironmentConfig;
import io.lettuce.core.RedisClient;
import io.lettuce.core.RedisURI;
import io.lettuce.core.api.StatefulRedisConnection;
import io.lettuce.core.api.sync.RedisCommands;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * @author everflowx
 */
@Service
public class RedisConnectionManager {
    
    @Autowired
    private RedisEnvironmentConfig config;
    
    private final Map<String, RedisClient> clients = new ConcurrentHashMap<>();
    private final Map<String, StatefulRedisConnection<String, String>> connections = new ConcurrentHashMap<>();
    
    public RedisCommands<String, String> getConnection(String environment) {
        if (!connections.containsKey(environment)) {
            createConnection(environment);
        }
        return connections.get(environment).sync();
    }
    
    private void createConnection(String environment) {
        RedisEnvironmentConfig.Environment env = config.getEnvironments().get(environment);
        if (env == null) {
            throw new IllegalArgumentException("Environment not found: " + environment);
        }
        
        RedisURI.Builder uriBuilder = RedisURI.builder()
                .withHost(env.getHost())
                .withPort(env.getPort())
                .withDatabase(env.getDatabase())
                .withTimeout(env.getTimeout());
        
        if (env.getPassword() != null && !env.getPassword().isEmpty()) {
            uriBuilder.withPassword(env.getPassword().toCharArray());
        }
        
        RedisClient client = RedisClient.create(uriBuilder.build());
        StatefulRedisConnection<String, String> connection = client.connect();
        
        clients.put(environment, client);
        connections.put(environment, connection);
    }
    
    public boolean testConnection(String environment) {
        try {
            RedisCommands<String, String> commands = getConnection(environment);
            String response = commands.ping();
            return "PONG".equals(response);
        } catch (Exception e) {
            return false;
        }
    }
    
    public void closeConnection(String environment) {
        StatefulRedisConnection<String, String> connection = connections.remove(environment);
        if (connection != null) {
            connection.close();
        }
        
        RedisClient client = clients.remove(environment);
        if (client != null) {
            client.shutdown();
        }
    }
    
    public void closeAllConnections() {
        connections.values().forEach(StatefulRedisConnection::close);
        clients.values().forEach(RedisClient::shutdown);
        connections.clear();
        clients.clear();
    }
}