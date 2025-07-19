package com.redisbutler.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * @author everflowx
 */
@Controller
public class PageController {
    
    @GetMapping("/")
    public String index() {
        return "index";
    }
}