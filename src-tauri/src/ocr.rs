/// Apple Vision Framework を使った OCR
/// PNG / JPEG の base64 データを受け取り、認識テキストのリストを返す

#[derive(Debug, Clone, serde::Serialize)]
pub struct OcrResult {
    pub text: String,
    pub confidence: f32,
}

#[cfg(target_os = "macos")]
fn recognize_text_inner(image_b64: &str, languages: &[String]) -> Result<Vec<OcrResult>, String> {
    use base64::Engine as _;
    use objc2::AnyThread;
    use objc2_foundation::{NSArray, NSData, NSDictionary, NSString};
    use objc2_vision::{
        VNImageRequestHandler, VNRecognizeTextRequest, VNRequestTextRecognitionLevel,
    };

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(image_b64)
        .map_err(|e| format!("base64 decode error: {e}"))?;

    unsafe {
        let ns_data = NSData::with_bytes(&bytes);
        let options: objc2::rc::Retained<NSDictionary<_, _>> = NSDictionary::dictionary();

        let handler = VNImageRequestHandler::initWithData_options(
            VNImageRequestHandler::alloc(),
            &ns_data,
            &options,
        );

        let request = VNRecognizeTextRequest::new();
        request.setRecognitionLevel(VNRequestTextRecognitionLevel::Accurate);

        if !languages.is_empty() {
            let ns_langs: Vec<objc2::rc::Retained<NSString>> = languages
                .iter()
                .map(|l| NSString::from_str(l))
                .collect();
            let arr = NSArray::from_retained_slice(&ns_langs);
            request.setRecognitionLanguages(&arr);
        }

        // NSArray<VNRequest> を作るために継承チェーンを辿る
        // VNRecognizeTextRequest → VNImageBasedRequest → VNRequest
        use objc2_vision::VNRequest;
        let image_based: objc2::rc::Retained<objc2_vision::VNImageBasedRequest> =
            objc2::rc::Retained::into_super(request.clone());
        let request_retained: objc2::rc::Retained<VNRequest> =
            objc2::rc::Retained::into_super(image_based);
        let requests = NSArray::from_retained_slice(&[request_retained]);

        handler
            .performRequests_error(&requests)
            .map_err(|e| format!("Vision error: {}", e.localizedDescription()))?;

        let mut results = Vec::new();
        if let Some(observations) = request.results() {
            for obs in observations.iter() {
                let candidates = obs.topCandidates(1);
                if let Some(candidate) = candidates.firstObject() {
                    results.push(OcrResult {
                        text: candidate.string().to_string(),
                        confidence: candidate.confidence(),
                    });
                }
            }
        }

        Ok(results)
    }
}

#[cfg(not(target_os = "macos"))]
fn recognize_text_inner(_image_b64: &str, _languages: &[String]) -> Result<Vec<OcrResult>, String> {
    Err("OCR is only supported on macOS".to_string())
}

/// Tauri コマンド: base64 PNG/JPEG → OCR テキスト行のリスト
/// languages: ["en-US", "ja-JP"] など（空の場合は Vision が自動検出）
#[tauri::command]
pub fn ocr_image(image_b64: String, languages: Vec<String>) -> Result<Vec<OcrResult>, String> {
    recognize_text_inner(&image_b64, &languages)
}
