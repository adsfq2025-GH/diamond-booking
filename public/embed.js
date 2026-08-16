/**
 * Diamond Booking — embeddable widget loader.
 *
 * Usage (paste before </body>):
 *   <script src="https://diamond-booking.com/embed.js" data-key="YOUR_KEY" async></script>
 *
 * Optionally set data-target="#css-selector" to mount into a specific element;
 * otherwise the widget is inserted where the script tag sits. The iframe
 * auto-resizes to its content via postMessage.
 */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) {
    var scripts = document.getElementsByTagName("script");
    for (var i = scripts.length - 1; i >= 0; i--) {
      if ((scripts[i].src || "").indexOf("embed.js") !== -1) {
        script = scripts[i];
        break;
      }
    }
  }
  if (!script) return;

  var key = script.getAttribute("data-key");
  if (!key) {
    console.error("[Diamond Booking] Missing data-key on embed script.");
    return;
  }

  // Derive the app origin from the script's own src.
  var origin;
  try {
    origin = new URL(script.src, window.location.href).origin;
  } catch {
    origin = "";
  }

  var src = origin + "/book/" + encodeURIComponent(key) + "?embed=1";

  var iframe = document.createElement("iframe");
  iframe.src = src;
  iframe.title = "Book an appointment";
  iframe.setAttribute("loading", "lazy");
  iframe.setAttribute("allow", "payment");
  iframe.style.width = "100%";
  iframe.style.border = "0";
  iframe.style.overflow = "hidden";
  iframe.style.minHeight = "560px";
  iframe.style.transition = "height 180ms ease";
  iframe.style.colorScheme = "light";

  // Mount point.
  var target = script.getAttribute("data-target");
  var mount = target ? document.querySelector(target) : null;
  if (mount) {
    mount.appendChild(iframe);
  } else if (script.parentNode) {
    script.parentNode.insertBefore(iframe, script.nextSibling);
  } else {
    document.body.appendChild(iframe);
  }

  // Auto-height: only trust messages from our own origin + this iframe.
  window.addEventListener("message", function (event) {
    if (origin && event.origin !== origin) return;
    if (event.source !== iframe.contentWindow) return;
    var data = event.data || {};
    if (data.type === "diamond-booking:height" && typeof data.height === "number") {
      iframe.style.height = Math.max(360, Math.ceil(data.height) + 8) + "px";
    }
  });
})();
