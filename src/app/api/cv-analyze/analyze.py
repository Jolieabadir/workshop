#!/usr/bin/env python3
"""
OpenCV Analysis Script for Workshop Scene Capture — Multi-View Triangulation

Reads base64 PNG frames from a JSON file (front, side, top views) and performs
multi-view spatial analysis:
- Per-frame contour detection and orientation analysis
- Cross-view part matching by color histogram similarity
- 3D orientation estimation from 2D observations
- 3D gap estimation by triangulation
- Volumetric scale ratios

Usage: python3 analyze.py <input_json_file>

Input JSON format:
[
  { "name": "front", "image": "<base64_png>" },
  { "name": "side", "image": "<base64_png>" },
  { "name": "top", "image": "<base64_png>" }
]

Output JSON format (to stdout):
{
  "per_frame": [ ... per-frame analysis ... ],
  "matched_parts": [ ... cross-view matched parts with 3D info ... ],
  "spatial_3d": {
    "estimated_rotations": [ { "part_index": 0, "axis": "x", "angle_deg": 90 }, ... ],
    "gaps_3d": [ { "between": [0, 1], "distance_units": 0.3, "direction": [0, 1, 0] }, ... ],
    "scale_3d": [ { "part_index": 0, "volume_ratio": 0.25 }, ... ]
  }
}
"""

import sys
import json
import base64
import numpy as np
from typing import List, Dict, Any, Tuple, Optional

try:
    import cv2
except ImportError:
    print(json.dumps({"error": "OpenCV not installed. Run: pip install opencv-python-headless numpy"}))
    sys.exit(1)


# ============================================================
# Basic Image Processing
# ============================================================

def decode_base64_image(base64_str: str) -> Optional[np.ndarray]:
    """Decode a base64 PNG string to an OpenCV image (BGR)."""
    try:
        if base64_str.startswith('data:'):
            base64_str = base64_str.split(',', 1)[1]
        img_bytes = base64.b64decode(base64_str)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return img
    except Exception as e:
        print(f"Error decoding image: {e}", file=sys.stderr)
        return None


def find_significant_contours(img: np.ndarray, min_area: int = 500) -> List[np.ndarray]:
    """Find significant contours using Canny edge detection."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    kernel = np.ones((3, 3), np.uint8)
    dilated = cv2.dilate(edges, kernel, iterations=2)
    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    significant = [c for c in contours if cv2.contourArea(c) >= min_area]
    significant.sort(key=cv2.contourArea, reverse=True)
    return significant


def compute_contour_centroid(contour: np.ndarray) -> Tuple[float, float]:
    """Compute the centroid of a contour."""
    M = cv2.moments(contour)
    if M["m00"] == 0:
        x, y, w, h = cv2.boundingRect(contour)
        return (x + w / 2, y + h / 2)
    return (M["m10"] / M["m00"], M["m01"] / M["m00"])


def compute_pca_orientation(contour: np.ndarray) -> Tuple[float, float]:
    """
    Compute principal axis orientation and elongation ratio.
    Returns (angle_deg, elongation) where elongation > 1 means elongated.
    """
    pts = contour.reshape(-1, 2).astype(np.float64)
    if len(pts) < 5:
        return (0.0, 1.0)

    mean = np.mean(pts, axis=0)
    centered = pts - mean
    cov = np.cov(centered.T)
    eigenvalues, eigenvectors = np.linalg.eig(cov)

    idx = np.argmax(eigenvalues)
    principal_axis = eigenvectors[:, idx]
    angle = np.degrees(np.arctan2(principal_axis[1], principal_axis[0]))
    if angle < 0:
        angle += 180

    # Elongation ratio (how stretched the part is)
    sorted_eig = sorted(eigenvalues, reverse=True)
    elongation = sorted_eig[0] / (sorted_eig[1] + 1e-10) if len(sorted_eig) > 1 else 1.0

    return (angle, elongation)


def compute_color_histogram(img: np.ndarray, contour: np.ndarray) -> np.ndarray:
    """Compute a normalized color histogram for contour region."""
    mask = np.zeros(img.shape[:2], dtype=np.uint8)
    cv2.drawContours(mask, [contour], 0, 255, -1)

    hist_b = cv2.calcHist([img], [0], mask, [32], [0, 256])
    hist_g = cv2.calcHist([img], [1], mask, [32], [0, 256])
    hist_r = cv2.calcHist([img], [2], mask, [32], [0, 256])

    hist = np.concatenate([hist_b, hist_g, hist_r]).flatten()
    hist = hist / (hist.sum() + 1e-10)
    return hist


def histogram_similarity(hist1: np.ndarray, hist2: np.ndarray) -> float:
    """Compute histogram similarity using correlation."""
    return cv2.compareHist(
        hist1.astype(np.float32),
        hist2.astype(np.float32),
        cv2.HISTCMP_CORREL
    )


def compute_gap_between_contours(c1: np.ndarray, c2: np.ndarray) -> Tuple[float, str]:
    """Compute minimum distance and direction between two contours."""
    x1, y1, w1, h1 = cv2.boundingRect(c1)
    x2, y2, w2, h2 = cv2.boundingRect(c2)

    cx1, cy1 = x1 + w1/2, y1 + h1/2
    cx2, cy2 = x2 + w2/2, y2 + h2/2

    dx = abs(cx2 - cx1)
    dy = abs(cy2 - cy1)

    if dx > dy * 1.5:
        direction = "horizontal"
    elif dy > dx * 1.5:
        direction = "vertical"
    else:
        direction = "diagonal"

    pts1 = c1[::5].reshape(-1, 2) if len(c1) > 10 else c1.reshape(-1, 2)
    pts2 = c2[::5].reshape(-1, 2) if len(c2) > 10 else c2.reshape(-1, 2)

    min_dist = float('inf')
    for p1 in pts1:
        for p2 in pts2:
            dist = np.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2)
            min_dist = min(min_dist, dist)

    return (min_dist, direction)


# ============================================================
# Per-Frame Analysis
# ============================================================

def analyze_frame(frame_name: str, img: np.ndarray) -> Dict[str, Any]:
    """Analyze a single frame with contour detection and orientation."""
    contours = find_significant_contours(img)

    parts = []
    for i, contour in enumerate(contours):
        area = cv2.contourArea(contour)
        cx, cy = compute_contour_centroid(contour)
        angle, elongation = compute_pca_orientation(contour)
        x, y, w, h = cv2.boundingRect(contour)
        hist = compute_color_histogram(img, contour)

        parts.append({
            "index": i,
            "centroid": [round(cx, 1), round(cy, 1)],
            "bounding_box": [x, y, w, h],
            "area_px": int(area),
            "orientation_deg": round(angle, 1),
            "elongation": round(elongation, 2),
            "histogram": hist.tolist()  # For cross-view matching
        })

    # Compute gaps
    gaps = []
    for i in range(len(contours)):
        for j in range(i + 1, len(contours)):
            gap_px, direction = compute_gap_between_contours(contours[i], contours[j])
            gaps.append({
                "between_indices": [i, j],
                "gap_px": round(gap_px, 1),
                "direction": direction
            })

    return {
        "frame_name": frame_name,
        "image_size": [img.shape[1], img.shape[0]],
        "parts_detected": len(parts),
        "parts": parts,
        "gaps": gaps
    }


# ============================================================
# Multi-View Triangulation
# ============================================================

def match_parts_across_views(
    frame_data: Dict[str, Dict],
    similarity_threshold: float = 0.6
) -> List[Dict[str, Any]]:
    """
    Match parts across front/side/top views using color histogram similarity.
    Returns list of matched parts with their indices in each view.
    """
    views = ['front', 'side', 'top']
    available_views = [v for v in views if v in frame_data and frame_data[v].get('parts')]

    if len(available_views) < 2:
        return []

    # Start with the view that has the most parts
    primary_view = max(available_views, key=lambda v: len(frame_data[v]['parts']))
    other_views = [v for v in available_views if v != primary_view]

    matched_parts = []

    for i, primary_part in enumerate(frame_data[primary_view]['parts']):
        match = {
            'primary_view': primary_view,
            'primary_index': i,
            'matches': {primary_view: i},
            'histograms': {primary_view: np.array(primary_part['histogram'])}
        }

        primary_hist = np.array(primary_part['histogram'])

        for other_view in other_views:
            best_match_idx = -1
            best_similarity = similarity_threshold

            for j, other_part in enumerate(frame_data[other_view]['parts']):
                other_hist = np.array(other_part['histogram'])
                sim = histogram_similarity(primary_hist, other_hist)

                if sim > best_similarity:
                    best_similarity = sim
                    best_match_idx = j

            if best_match_idx >= 0:
                match['matches'][other_view] = best_match_idx

        matched_parts.append(match)

    return matched_parts


def estimate_3d_orientation(
    matched_part: Dict,
    frame_data: Dict[str, Dict]
) -> Optional[Dict[str, Any]]:
    """
    Estimate 3D orientation by analyzing 2D orientations across views.

    View mapping (camera looking at origin):
    - Front (Z+): sees X (horizontal) and Y (vertical)
    - Side (X+): sees Z (horizontal) and Y (vertical)
    - Top (Y+): sees X (horizontal) and Z (vertical)

    Returns estimated rotation axis and angle if part appears rotated.
    """
    matches = matched_part['matches']

    orientations = {}
    elongations = {}

    for view, idx in matches.items():
        part = frame_data[view]['parts'][idx]
        orientations[view] = part['orientation_deg']
        elongations[view] = part['elongation']

    # Expected orientations for "upright" parts:
    # - Front view: elongated parts should be ~90° (vertical) or ~0° (horizontal)
    # - Side view: same as front for vertical parts
    # - Top view: circular/square from above for vertical cylinders

    result = {
        'part_index': matched_part['primary_index'],
        'orientations_2d': orientations,
        'elongations': elongations,
        'estimated_rotation': None
    }

    # Detect rotation issues
    if 'front' in orientations and 'side' in orientations:
        front_angle = orientations['front']
        side_angle = orientations['side']
        front_elong = elongations.get('front', 1)
        side_elong = elongations.get('side', 1)

        # If elongated in front but not side, might be rotated on Y axis
        if front_elong > 2.0 and side_elong < 1.5:
            # Part is stretched horizontally in front view
            if 45 < front_angle < 135:
                # Elongation is vertical in front = correct for vertical part
                pass
            else:
                # Elongation is horizontal = part might be lying down
                result['estimated_rotation'] = {
                    'axis': 'x',
                    'angle_deg': 90,
                    'confidence': 0.7,
                    'reason': 'Part appears horizontal in front view but should be vertical'
                }

        # If elongated in side but compact in front, might be rotated on X axis
        if side_elong > 2.0 and front_elong < 1.5:
            if not (45 < side_angle < 135):
                result['estimated_rotation'] = {
                    'axis': 'z',
                    'angle_deg': 90,
                    'confidence': 0.7,
                    'reason': 'Part appears horizontal in side view'
                }

    if 'front' in orientations and 'top' in orientations:
        front_angle = orientations['front']
        top_elong = elongations.get('top', 1)

        # If circular from top but elongated from front, it's correctly vertical
        # If elongated from top, the "vertical" axis is actually pointing sideways
        if top_elong > 2.0:
            top_angle = orientations['top']
            # Determine which way it's pointing based on top view elongation direction
            if top_angle < 45 or top_angle > 135:
                # Elongated along X in top view = rotated to point along X
                result['estimated_rotation'] = {
                    'axis': 'z',
                    'angle_deg': -90,
                    'confidence': 0.8,
                    'reason': 'Part elongated along X axis when viewed from top'
                }
            else:
                # Elongated along Z in top view = rotated to point along Z
                result['estimated_rotation'] = {
                    'axis': 'x',
                    'angle_deg': 90,
                    'confidence': 0.8,
                    'reason': 'Part elongated along Z axis when viewed from top'
                }

    return result


def estimate_3d_gaps(
    matched_parts: List[Dict],
    frame_data: Dict[str, Dict],
    px_to_world: float = 0.01  # Approximate pixels to world units
) -> List[Dict[str, Any]]:
    """
    Estimate 3D gaps by triangulating 2D gap measurements.

    For two parts visible in multiple views:
    - Front gap gives XY distance
    - Side gap gives ZY distance
    - Top gap gives XZ distance

    Combine to estimate 3D distance and direction.
    """
    gaps_3d = []

    for i, part_a in enumerate(matched_parts):
        for j, part_b in enumerate(matched_parts):
            if j <= i:
                continue

            # Find views where both parts are visible
            common_views = set(part_a['matches'].keys()) & set(part_b['matches'].keys())

            if len(common_views) < 2:
                continue

            gap_measurements = {}

            for view in common_views:
                idx_a = part_a['matches'][view]
                idx_b = part_b['matches'][view]

                # Find the gap measurement for this pair in this view
                for gap in frame_data[view].get('gaps', []):
                    if set(gap['between_indices']) == {idx_a, idx_b}:
                        gap_measurements[view] = gap
                        break

            if len(gap_measurements) < 2:
                continue

            # Triangulate 3D gap
            dx, dy, dz = 0, 0, 0

            if 'front' in gap_measurements:
                g = gap_measurements['front']
                if g['direction'] == 'horizontal':
                    dx = g['gap_px'] * px_to_world
                elif g['direction'] == 'vertical':
                    dy = g['gap_px'] * px_to_world
                else:
                    dx = g['gap_px'] * px_to_world * 0.7
                    dy = g['gap_px'] * px_to_world * 0.7

            if 'side' in gap_measurements:
                g = gap_measurements['side']
                if g['direction'] == 'horizontal':
                    dz = g['gap_px'] * px_to_world
                elif g['direction'] == 'vertical':
                    dy = max(dy, g['gap_px'] * px_to_world)  # Refine Y estimate

            if 'top' in gap_measurements:
                g = gap_measurements['top']
                if g['direction'] == 'horizontal':
                    dx = max(dx, g['gap_px'] * px_to_world)
                elif g['direction'] == 'vertical':
                    dz = max(dz, g['gap_px'] * px_to_world)

            distance_3d = np.sqrt(dx**2 + dy**2 + dz**2)

            if distance_3d > 0.01:  # Only report significant gaps
                direction = [
                    round(dx / (distance_3d + 1e-10), 2),
                    round(dy / (distance_3d + 1e-10), 2),
                    round(dz / (distance_3d + 1e-10), 2)
                ]

                gaps_3d.append({
                    'between_parts': [i, j],
                    'distance_units': round(distance_3d, 3),
                    'direction_3d': direction,
                    'views_used': list(gap_measurements.keys())
                })

    return gaps_3d


def estimate_3d_scale(
    matched_parts: List[Dict],
    frame_data: Dict[str, Dict]
) -> List[Dict[str, Any]]:
    """
    Estimate volumetric scale by combining areas from multiple views.

    For a matched part:
    - Front area ~ width × height
    - Side area ~ depth × height
    - Top area ~ width × depth

    Volume ~ sqrt(front_area × side_area × top_area)^(2/3) (rough estimate)
    """
    scales = []

    volumes = []
    for i, part in enumerate(matched_parts):
        areas = {}
        for view, idx in part['matches'].items():
            areas[view] = frame_data[view]['parts'][idx]['area_px']

        # Estimate volume from available views
        if len(areas) >= 2:
            area_product = 1.0
            for area in areas.values():
                area_product *= area

            # Normalize by number of views
            volume_estimate = area_product ** (1.0 / len(areas))
            volumes.append((i, volume_estimate, areas))

    if not volumes:
        return []

    # Find largest volume as reference
    max_volume = max(v[1] for v in volumes)

    for i, volume, areas in volumes:
        ratio = volume / max_volume if max_volume > 0 else 1.0
        scales.append({
            'part_index': i,
            'volume_ratio': round(ratio, 3),
            'areas_by_view': {k: int(v) for k, v in areas.items()}
        })

    return scales


# ============================================================
# Main Analysis
# ============================================================

def analyze_multiview(frames: List[Dict]) -> Dict[str, Any]:
    """
    Perform multi-view analysis on captured frames.
    """
    # Analyze each frame independently first
    frame_data = {}
    per_frame_results = []

    for frame in frames:
        name = frame.get('name', 'unknown')
        image_b64 = frame.get('image', '')

        if not image_b64:
            per_frame_results.append({
                "frame_name": name,
                "error": "No image data provided"
            })
            continue

        img = decode_base64_image(image_b64)
        if img is None:
            per_frame_results.append({
                "frame_name": name,
                "error": "Failed to decode image"
            })
            continue

        result = analyze_frame(name, img)
        per_frame_results.append(result)
        frame_data[name] = result

    # Multi-view triangulation
    matched_parts = match_parts_across_views(frame_data)

    # Estimate 3D properties
    estimated_rotations = []
    for part in matched_parts:
        rotation_info = estimate_3d_orientation(part, frame_data)
        if rotation_info and rotation_info.get('estimated_rotation'):
            estimated_rotations.append({
                'part_index': rotation_info['part_index'],
                **rotation_info['estimated_rotation']
            })

    gaps_3d = estimate_3d_gaps(matched_parts, frame_data)
    scales_3d = estimate_3d_scale(matched_parts, frame_data)

    # Clean up histogram data from output (too verbose)
    for result in per_frame_results:
        if 'parts' in result:
            for part in result['parts']:
                if 'histogram' in part:
                    del part['histogram']

    return {
        "per_frame": per_frame_results,
        "matched_parts_count": len(matched_parts),
        "spatial_3d": {
            "estimated_rotations": estimated_rotations,
            "gaps_3d": gaps_3d,
            "scale_3d": scales_3d
        }
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python3 analyze.py <input_json_file>"}))
        sys.exit(1)

    input_file = sys.argv[1]

    try:
        with open(input_file, 'r') as f:
            frames = json.load(f)

        if not isinstance(frames, list):
            print(json.dumps({"error": "Input must be a JSON array of frames"}))
            sys.exit(1)

        result = analyze_multiview(frames)
        print(json.dumps(result))

    except FileNotFoundError:
        print(json.dumps({"error": f"Input file not found: {input_file}"}))
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON in input file: {str(e)}"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": f"Analysis failed: {str(e)}"}))
        sys.exit(1)


if __name__ == "__main__":
    main()
