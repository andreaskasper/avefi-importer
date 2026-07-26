<?php

class CLI {

    public static function is_cli() {
        return (php_sapi_name() === 'cli' || defined('STDIN'));
    }

    public static function write_error(string $txt) {
        echo("[\033[0;31mERROR\033[0m] ".$txt.PHP_EOL);
    }

}