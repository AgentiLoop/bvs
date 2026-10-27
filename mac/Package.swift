// swift-tools-version:5.9
// The web-thin macOS app: one window with a WKWebView playing the hosted game (https://bvs.agentiloop.ai/).
// Build with mac/build-web-thin.sh.
import PackageDescription

let package = Package(
    name: "BvS",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "BvS",
            path: "Sources/BvS",
            linkerSettings: [.linkedFramework("WebKit"), .linkedFramework("AppKit")]
        ),
    ]
)
