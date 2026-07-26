<?php if (!defined("avefi_entrypoint")) { http_response_code(403); exit; } ?>
<script>
  (function(){
    var btn = document.getElementById("themeBtn");
    if(!btn) return;
    btn.addEventListener("click", function(){
      var root = document.documentElement;
      var cur = root.getAttribute("data-theme");
      var prefersDark = matchMedia("(prefers-color-scheme: dark)").matches;
      var next = cur === "dark" ? "light" : cur === "light" ? "dark" : (prefersDark ? "light" : "dark");
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("avefi-theme", next); } catch(e){}
    });
  })();

  /* Benutzer-Kontextmenü (hinter dem Avatar) */
  (function(){
    var btn = document.getElementById("userMenuBtn");
    var menu = document.getElementById("userMenu");
    if(!btn || !menu) return;
    function close(){ menu.hidden = true; btn.setAttribute("aria-expanded","false"); }
    function open(){ menu.hidden = false; btn.setAttribute("aria-expanded","true"); }
    btn.addEventListener("click", function(e){ e.stopPropagation(); menu.hidden ? open() : close(); });
    document.addEventListener("click", function(e){
      if(!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) close();
    });
    document.addEventListener("keydown", function(e){ if(e.key === "Escape") close(); });
  })();
</script>
</body>
</html>
