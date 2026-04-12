#!/usr/bin/env python3
"""
OpenCV Analysis Script for Workshop Scene Capture

Reads base64 PNG frames from a JSON file and performs spatial analysis:
- Canny edge detection to find mesh boundaries
- findContours to detect individual part silhouettes
- Gap measurement between adjacent contours
- PCA orientation analysis
- Scale ratio computation
- Visual coherence scoring via color histogram similarity

Usage: python3 analyze.py <input_json_file>

Input JSON format:
[
  { "name": "front", "image": "<base64_png>" },
  { "name": "side", "image": "<base64_png>" },
  ...
]

Output JSON format (to stdout):
[
  {
    "frame_name": "front",
    "parts_detected": 5,
    "gaps": [{ "between_indices": [0, 1], "gap_px": 12, "direction": "vertical" }],
    "orientations": [{ "contour_index": 0, "principal_axis_deg": 87, "area_px": 4500 }],
    "scale_ratios": [{ "indices": [0, 1], "area_ratio": 0.85 }],
    "visual_coherence": 0.72
  },
  ...
]
"""

import sys
import json
import base64
import numpy as np
from typing import List, Dict, Any, Tuple, Optional

try:
    import cv2
except ImportError:
    print(json.dumps([{"error": "OpenCV not installed. Run: pip install opencv-python-headless numpy"}]))
    sys.exit(1)


def decode_base64_image(base64_str: str) -> Optional[np.ndarray]:
    """Decode a base64 PNG string to an OpenCV image (BGR)."""
    try:
        # Remove data URL prefix if present
        if base64_str.startswith('data:'):
            base64_str = base64_str.split(',', 1)[1]

        # Decode base64 to bytes
        img_bytes = base64.b64decode(base64_str)

        # Convert to numpy array
        nparr = np.frombuffer(img_bytes, np.uint8)

        # Decode image
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return img
    except Exception as e:
        print(f"Error decoding image: {e}", file=sys.stderr)
        return None


def find_significant_contours(img: np.ndarray, min_area: int = 500) -> List[np.ndarray]:
    """
    Find significant contours in the image using Canny edge detection.
    Filters out small noise contours.
    """
    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Apply Gaussian blur to reduce noise
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # Canny edge detection
    edges = cv2.Canny(blurred, 50, 150)

    # Dilate edges to close gaps
    kernel = np.ones((3, 3), np.uint8)
    dilated = cv2.dilate(edges, kernel, iterations=2)

    # Find contours
    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    # Filter by area
    significant = [c for c in contours if cv2.contourArea(c) >= min_area]

    # Sort by area (largest first)
    significant.sort(key=cv2.contourArea, reverse=True)

    return significant


def compute_contour_centroid(contour: np.ndarray) -> Tuple[float, float]:
    """Compute the centroid of a contour."""
    M = cv2.moments(contour)
    if M["m00"] == 0:
        # Fallback to bounding rect center
        x, y, w, h = cv2.boundingRect(contour)
        return (x + w / 2, y + h / 2)
    return (M["m10"] / M["m00"], M["m01"] / M["m00"])


def compute_gap_between_contours(c1: np.ndarray, c2: np.ndarray) -> Tuple[float, str]:
    """
    Compute the minimum distance between two contours and determine direction.
    Returns (gap_px, direction).
    """
    # Get bounding rects
    x1, y1, w1, h1 = cv2.boundingRect(c1)
    x2, y2, w2, h2 = cv2.boundingRect(c2)

    # Compute centroids
    cx1, cy1 = x1 + w1/2, y1 + h1/2
    cx2, cy2 = x2 + w2/2, y2 + h2/2

    # Determine primary direction of gap
    dx = abs(cx2 - cx1)
    dy = abs(cy2 - cy1)

    if dx > dy * 1.5:
        direction = "horizontal"
    elif dy > dx * 1.5:
        direction = "vertical"
    else:
        direction = "diagonal"

    # Compute minimum distance between contour points (sampled for performance)
    # Sample every 5th point to speed up
    pts1 = c1[::5].reshape(-1, 2) if len(c1) > 10 else c1.reshape(-1, 2)
    pts2 = c2[::5].reshape(-1, 2) if len(c2) > 10 else c2.reshape(-1, 2)

    min_dist = float('inf')
    for p1 in pts1:
        for p2 in pts2:
            dist = np.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2)
            min_dist = min(min_dist, dist)

    return (min_dist, direction)


def compute_pca_orientation(contour: np.ndarray) -> float:
    """
    Compute the principal axis orientation of a contour using PCA.
    Returns angle in degrees (0-180).
    """
    # Get contour points
    pts = contour.reshape(-1, 2).astype(np.float64)

    if len(pts) < 5:
        return 0.0

    # Center the points
    mean = np.mean(pts, axis=0)
    centered = pts - mean

    # Compute covariance matrix
    cov = np.cov(centered.T)

    # Compute eigenvalues and eigenvectors
    eigenvalues, eigenvectors = np.linalg.eig(cov)

    # Get principal axis (eigenvector with largest eigenvalue)
    idx = np.argmax(eigenvalues)
    principal_axis = eigenvectors[:, idx]

    # Compute angle in degrees
    angle = np.degrees(np.arctan2(principal_axis[1], principal_axis[0]))

    # Normalize to 0-180 range
    if angle < 0:
        angle += 180

    return angle


def compute_color_histogram(img: np.ndarray, contour: np.ndarray) -> np.ndarray:
    """Compute a color histogram for the region inside a contour."""
    # Create mask
    mask = np.zeros(img.shape[:2], dtype=np.uint8)
    cv2.drawContours(mask, [contour], 0, 255, -1)

    # Compute histogram for each channel
    hist_b = cv2.calcHist([img], [0], mask, [32], [0, 256])
    hist_g = cv2.calcHist([img], [1], mask, [32], [0, 256])
    hist_r = cv2.calcHist([img], [2], mask, [32], [0, 256])

    # Concatenate and normalize
    hist = np.concatenate([hist_b, hist_g, hist_r]).flatten()
    hist = hist / (hist.sum() + 1e-10)

    return hist


def compute_histogram_similarity(hist1: np.ndarray, hist2: np.ndarray) -> float:
    """Compute histogram similarity using correlation coefficient."""
    return cv2.compareHist(
        hist1.astype(np.float32),
        hist2.astype(np.float32),
        cv2.HISTCMP_CORREL
    )


def compute_visual_coherence(img: np.ndarray, contours: List[np.ndarray]) -> float:
    """
    Compute visual coherence score based on color histogram similarity
    between detected parts. Returns 0-1 score (1 = perfectly coherent).
    """
    if len(contours) < 2:
        return 1.0  # Single part is perfectly coherent with itself

    # Compute histograms for each contour
    histograms = [compute_color_histogram(img, c) for c in contours]

    # Compute pairwise similarities
    similarities = []
    for i in range(len(histograms)):
        for j in range(i + 1, len(histograms)):
            sim = compute_histogram_similarity(histograms[i], histograms[j])
            similarities.append(sim)

    if not similarities:
        return 1.0

    # Average similarity, normalized to 0-1
    avg_sim = np.mean(similarities)
    # Correlation can be negative, clamp to 0-1
    return max(0.0, min(1.0, (avg_sim + 1) / 2))


def analyze_frame(frame_name: str, img: np.ndarray) -> Dict[str, Any]:
    """Analyze a single frame and return structured results."""
    result = {
        "frame_name": frame_name,
        "parts_detected": 0,
        "gaps": [],
        "orientations": [],
        "scale_ratios": [],
        "visual_coherence": 1.0
    }

    # Find significant contours
    contours = find_significant_contours(img)
    result["parts_detected"] = len(contours)

    if len(contours) == 0:
        return result

    # Compute orientations for each contour
    for i, contour in enumerate(contours):
        area = cv2.contourArea(contour)
        angle = compute_pca_orientation(contour)
        result["orientations"].append({
            "contour_index": i,
            "principal_axis_deg": round(angle, 1),
            "area_px": int(area)
        })

    # Compute gaps between adjacent contours (by centroid proximity)
    if len(contours) >= 2:
        # Get centroids
        centroids = [compute_contour_centroid(c) for c in contours]

        # Find nearest neighbors and compute gaps
        for i in range(len(contours)):
            # Find the nearest contour to this one
            min_dist = float('inf')
            nearest_idx = -1

            for j in range(len(contours)):
                if i == j:
                    continue
                cx1, cy1 = centroids[i]
                cx2, cy2 = centroids[j]
                dist = np.sqrt((cx2 - cx1)**2 + (cy2 - cy1)**2)
                if dist < min_dist:
                    min_dist = dist
                    nearest_idx = j

            if nearest_idx > i:  # Avoid duplicates (only compute once per pair)
                gap_px, direction = compute_gap_between_contours(contours[i], contours[nearest_idx])
                result["gaps"].append({
                    "between_indices": [i, nearest_idx],
                    "gap_px": round(gap_px, 1),
                    "direction": direction
                })

    # Compute scale ratios between parts
    if len(contours) >= 2:
        areas = [cv2.contourArea(c) for c in contours]
        for i in range(len(contours)):
            for j in range(i + 1, len(contours)):
                if areas[j] > 0:
                    ratio = areas[i] / areas[j]
                    result["scale_ratios"].append({
                        "indices": [i, j],
                        "area_ratio": round(ratio, 3)
                    })

    # Compute visual coherence
    result["visual_coherence"] = round(compute_visual_coherence(img, contours), 3)

    return result


def main():
    if len(sys.argv) < 2:
        print(json.dumps([{"error": "Usage: python3 analyze.py <input_json_file>"}]))
        sys.exit(1)

    input_file = sys.argv[1]

    try:
        # Read input JSON
        with open(input_file, 'r') as f:
            frames = json.load(f)

        if not isinstance(frames, list):
            print(json.dumps([{"error": "Input must be a JSON array of frames"}]))
            sys.exit(1)

        results = []

        for frame in frames:
            name = frame.get('name', 'unknown')
            image_b64 = frame.get('image', '')

            if not image_b64:
                results.append({
                    "frame_name": name,
                    "error": "No image data provided"
                })
                continue

            # Decode image
            img = decode_base64_image(image_b64)
            if img is None:
                results.append({
                    "frame_name": name,
                    "error": "Failed to decode image"
                })
                continue

            # Analyze frame
            result = analyze_frame(name, img)
            results.append(result)

        # Output results as JSON
        print(json.dumps(results))

    except FileNotFoundError:
        print(json.dumps([{"error": f"Input file not found: {input_file}"}]))
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(json.dumps([{"error": f"Invalid JSON in input file: {str(e)}"}]))
        sys.exit(1)
    except Exception as e:
        print(json.dumps([{"error": f"Analysis failed: {str(e)}"}]))
        sys.exit(1)


if __name__ == "__main__":
    main()
