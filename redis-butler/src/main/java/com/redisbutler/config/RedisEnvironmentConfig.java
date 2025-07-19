package com.redisbutler.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Map;

/**
 * @author everflowx
 */
@Component
@ConfigurationProperties(prefix = "redis")
public class RedisEnvironmentConfig {
    
    private Map<String, Environment> environments;
    
    public Map<String, Environment> getEnvironments() {
        return environments;
    }
    
    public void setEnvironments(Map<String, Environment> environments) {
        this.environments = environments;
    }
    
    public static class Environment {
        private String host;
        private int port;
        private int database;
        private String password;
        private Duration timeout;
        
        public String getHost() {
            return host;
        }
        
        public void setHost(String host) {
            this.host = host;
        }
        
        public int getPort() {
            return port;
        }
        
        public void setPort(int port) {
            this.port = port;
        }
        
        public int getDatabase() {
            return database;
        }
        
        public void setDatabase(int database) {
            this.database = database;
        }
        
        public String getPassword() {
            return password;
        }
        
        public void setPassword(String password) {
            this.password = password;
        }
        
        public Duration getTimeout() {
            return timeout;
        }
        
        public void setTimeout(Duration timeout) {
            this.timeout = timeout;
        }
    }
}