// Batman v Superman as a macOS app: one window holding a WKWebView that plays the hosted game.
// No game files are bundled. $BVS_WEB_URL (or --url URL) points it at another server, e.g. a local one.
import AppKit
import WebKit

let WEB_URL = "https://bvs.agentiloop.ai/"   // deploy/publish.sh

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var url = URL(string: WEB_URL)!

    func applicationDidFinishLaunching(_ notification: Notification) {
        let args = CommandLine.arguments
        if let i = args.firstIndex(of: "--url"), i + 1 < args.count, let u = URL(string: args[i + 1]) { url = u }
        else if let s = ProcessInfo.processInfo.environment["BVS_WEB_URL"], let u = URL(string: s) { url = u }

        let config = WKWebViewConfiguration()
        config.mediaTypesRequiringUserActionForPlayback = []
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        let size = NSSize(width: 1280, height: 720)
        webView = WKWebView(frame: NSRect(origin: .zero, size: size), configuration: config)
        webView.navigationDelegate = self
        webView.autoresizingMask = [.width, .height]
        webView.setValue(false, forKey: "drawsBackground")

        window = NSWindow(contentRect: NSRect(origin: .zero, size: size),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Batman v Superman"
        window.collectionBehavior = [.fullScreenPrimary]
        window.contentView = webView
        window.backgroundColor = NSColor(red: 0x0b / 255.0, green: 0x0d / 255.0, blue: 0x12 / 255.0, alpha: 1)
        window.center()
        window.makeKeyAndOrderFront(nil)
        window.makeFirstResponder(webView)
        buildMenu()
        NSApp.activate(ignoringOtherApps: true)
        webView.load(URLRequest(url: url))
    }

    func buildMenu() {
        let menu = NSMenu()
        let app = NSMenuItem(); menu.addItem(app)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Quit Batman v Superman", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        app.submenu = appMenu
        let view = NSMenuItem(); menu.addItem(view)
        let viewMenu = NSMenu(title: "View")
        viewMenu.addItem(withTitle: "Reload", action: #selector(reload), keyEquivalent: "r")
        viewMenu.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        view.submenu = viewMenu
        NSApp.mainMenu = menu
    }

    @objc func reload() { webView.reload() }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
