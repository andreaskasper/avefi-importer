<?php
/* Gemeinsamer Seitenkopf. Erwartet optional: $page_title, $body_class. */
if (!defined("avefi_entrypoint")) { http_response_code(403); exit; }
$page_title = isset($page_title) ? $page_title : "AVefi Importer";
$body_class = isset($body_class) ? $body_class : "";
?><!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title><?php echo html($page_title); ?></title>
<link rel="icon" type="image/svg+xml" href="/skins/favicon.svg">
<link rel="icon" type="image/png" sizes="96x96" href="/skins/favicon-96x96.png">
<link rel="shortcut icon" href="/favicon.ico">
<link rel="apple-touch-icon" sizes="180x180" href="/skins/apple-touch-icon.png">
<link rel="stylesheet" href="/skins/app.css">
<!-- Vue 3 (global build, vendored) — projektweit verfügbar für interaktive Komponenten -->
<script src="/skins/vue.global.prod.js"></script>
<script src="/skins/modal.js"></script>
<script>
  /* Theme früh anwenden, um Flackern zu vermeiden. */
  (function(){ try{ var t=localStorage.getItem("avefi-theme"); if(t) document.documentElement.setAttribute("data-theme", t); }catch(e){} })();
</script>
</head>
<body class="<?php echo html($body_class); ?>">
