import AVFoundation
import Foundation
import Speech

// Preparation helper for the iOS 26 live-microphone guide.
// It does not request permission, record audio, or own a recording session.
@available(iOS 26.0, *)
public struct PreparedSpeechAnalyzer {
    public let locale: Locale
    public let transcriber: SpeechTranscriber
    public let analyzer: SpeechAnalyzer
    public let audioFormat: AVAudioFormat
}

@available(iOS 26.0, *)
public enum SpeechPreparationError: Error {
    case deviceUnavailable
    case unsupportedLocale
    case assetsNotInstalled
    case noCompatibleFormat
    case tooManyPhrases
}

@available(iOS 26.0, *)
@MainActor
public func prepareSpeechAnalyzer(
    requestedLocale: Locale,
    naturalFormat: AVAudioFormat? = nil
) async throws -> PreparedSpeechAnalyzer {
    guard SpeechTranscriber.isAvailable else {
        throw SpeechPreparationError.deviceUnavailable
    }
    guard let locale = await SpeechTranscriber.supportedLocale(
        equivalentTo: requestedLocale
    ) else {
        throw SpeechPreparationError.unsupportedLocale
    }

    let transcriber = SpeechTranscriber(
        locale: locale,
        preset: .progressiveTranscription
    )
    // The system may already have the asset; nil means no install is needed.
    // A request can automatically reserve the locale or throw if no slot is free.
    if let request = try await AssetInventory.assetInstallationRequest(
        supporting: [transcriber]
    ) {
        try await request.downloadAndInstall()
    }
    try Task.checkCancellation()
    guard await AssetInventory.status(forModules: [transcriber]) == .installed else {
        throw SpeechPreparationError.assetsNotInstalled
    }
    guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(
        compatibleWith: [transcriber], considering: naturalFormat
    ) else {
        throw SpeechPreparationError.noCompatibleFormat
    }

    let analyzer = SpeechAnalyzer(modules: [transcriber])
    try await analyzer.prepareToAnalyze(in: format)
    return PreparedSpeechAnalyzer(
        locale: locale, transcriber: transcriber,
        analyzer: analyzer, audioFormat: format
    )
}

// Use this only for an analyzer configured with DictationTranscriber.
// Apple's contextualStrings documentation describes support for that module.
@available(iOS 26.0, *)
@MainActor
public func setDictationPhraseHints(
    _ phrases: [String], on analyzer: SpeechAnalyzer
) async throws {
    // This example replaces the context. Merge with an existing context if needed.
    guard phrases.count <= 100 else {
        throw SpeechPreparationError.tooManyPhrases
    }
    let context = AnalysisContext()
    context.contextualStrings[.general] = phrases
    try await analyzer.setContext(context)
}
