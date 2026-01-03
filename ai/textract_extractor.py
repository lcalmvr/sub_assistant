"""
Textract-based document extraction with bounding box coordinates.

This module provides:
1. OCR with checkbox detection (SELECTION_ELEMENT)
2. Bounding box coordinates for highlighting
3. Form key-value pair extraction

Cost: ~$0.015/page for AnalyzeDocument with Forms feature
"""

import boto3
from dataclasses import dataclass, field
from typing import Optional
import json


@dataclass
class BoundingBox:
    """Normalized bounding box (0-1 scale)."""
    left: float
    top: float
    width: float
    height: float

    def to_pixels(self, page_width: int, page_height: int) -> dict:
        """Convert normalized coords to pixel coordinates."""
        return {
            "x": int(self.left * page_width),
            "y": int(self.top * page_height),
            "width": int(self.width * page_width),
            "height": int(self.height * page_height),
        }

    def to_dict(self) -> dict:
        return {
            "left": self.left,
            "top": self.top,
            "width": self.width,
            "height": self.height,
        }


@dataclass
class ExtractedField:
    """A field extracted from the document with provenance."""
    field_name: str
    value: any
    confidence: float
    page: int
    bbox: BoundingBox
    field_type: str = "text"  # text, checkbox, table_cell
    is_selected: Optional[bool] = None  # For checkboxes
    source_text: Optional[str] = None


@dataclass
class TextractResult:
    """Complete extraction result from a document."""
    document_id: Optional[str] = None
    pages: int = 0
    fields: list[ExtractedField] = field(default_factory=list)
    key_value_pairs: dict = field(default_factory=dict)
    checkboxes: list[ExtractedField] = field(default_factory=list)
    raw_text: str = ""

    def to_dict(self) -> dict:
        return {
            "document_id": self.document_id,
            "pages": self.pages,
            "fields": [
                {
                    "field_name": f.field_name,
                    "value": f.value,
                    "confidence": f.confidence,
                    "page": f.page,
                    "bbox": f.bbox.to_dict(),
                    "field_type": f.field_type,
                    "is_selected": f.is_selected,
                    "source_text": f.source_text,
                }
                for f in self.fields
            ],
            "key_value_pairs": self.key_value_pairs,
            "checkboxes": [
                {
                    "field_name": c.field_name,
                    "is_selected": c.is_selected,
                    "confidence": c.confidence,
                    "page": c.page,
                    "bbox": c.bbox.to_dict(),
                }
                for c in self.checkboxes
            ],
        }


def get_textract_client():
    """Get Textract client. Uses default AWS credential chain."""
    import os
    from dotenv import load_dotenv
    load_dotenv()

    return boto3.client(
        'textract',
        region_name=os.environ.get('AWS_DEFAULT_REGION', 'us-east-1')
    )


def extract_from_pdf(file_path: str, max_pages: int = 10) -> TextractResult:
    """
    Extract text, forms, and checkboxes from a PDF using Textract.

    Converts PDF pages to images since synchronous AnalyzeDocument
    only supports single-page documents.

    Args:
        file_path: Path to the PDF file
        max_pages: Maximum number of pages to process

    Returns:
        TextractResult with all extracted data and bounding boxes
    """
    from pdf2image import convert_from_path
    import io

    client = get_textract_client()

    # Convert PDF to images
    images = convert_from_path(file_path, dpi=200, first_page=1, last_page=max_pages)

    all_blocks = []
    page_num = 0

    for img in images:
        page_num += 1

        # Convert PIL image to bytes
        img_buffer = io.BytesIO()
        img.save(img_buffer, format='PNG')
        img_bytes = img_buffer.getvalue()

        # Call Textract for this page
        try:
            response = client.analyze_document(
                Document={'Bytes': img_bytes},
                FeatureTypes=['FORMS']
            )

            # Add page number to each block
            for block in response.get('Blocks', []):
                block['Page'] = page_num
                all_blocks.append(block)

        except Exception as e:
            print(f"Warning: Failed to process page {page_num}: {e}")
            continue

    return parse_textract_response({'Blocks': all_blocks}, total_pages=page_num)


def extract_from_pdf_async(file_path: str, s3_bucket: str, s3_key: str) -> str:
    """
    Start async extraction for multi-page PDFs (>1 page requires async).

    Args:
        file_path: Local path to upload from
        s3_bucket: S3 bucket name
        s3_key: S3 object key

    Returns:
        Job ID for checking status
    """
    import boto3

    # Upload to S3 first
    s3 = boto3.client('s3')
    with open(file_path, 'rb') as f:
        s3.upload_fileobj(f, s3_bucket, s3_key)

    # Start async analysis
    client = get_textract_client()
    response = client.start_document_analysis(
        DocumentLocation={
            'S3Object': {
                'Bucket': s3_bucket,
                'Name': s3_key,
            }
        },
        FeatureTypes=['FORMS']
    )

    return response['JobId']


def get_async_result(job_id: str) -> Optional[TextractResult]:
    """
    Get result of async extraction job.

    Returns None if job is still in progress.
    """
    client = get_textract_client()

    response = client.get_document_analysis(JobId=job_id)

    if response['JobStatus'] == 'IN_PROGRESS':
        return None
    elif response['JobStatus'] == 'FAILED':
        raise Exception(f"Textract job failed: {response.get('StatusMessage', 'Unknown error')}")

    # Collect all pages (paginated response)
    all_blocks = response['Blocks']

    while 'NextToken' in response:
        response = client.get_document_analysis(
            JobId=job_id,
            NextToken=response['NextToken']
        )
        all_blocks.extend(response['Blocks'])

    return parse_textract_response({'Blocks': all_blocks})


def parse_textract_response(response: dict, total_pages: int = None) -> TextractResult:
    """
    Parse Textract response into structured result.

    Handles:
    - LINE/WORD blocks for raw text
    - KEY_VALUE_SET for form fields
    - SELECTION_ELEMENT for checkboxes
    """
    result = TextractResult()
    blocks = response.get('Blocks', [])

    # Build block lookup
    block_map = {b['Id']: b for b in blocks}

    # Track pages
    page_count = 0

    # Collect raw text
    lines = []

    for block in blocks:
        block_type = block['BlockType']

        # Count pages
        if block_type == 'PAGE':
            page_count += 1

        # Extract text lines
        elif block_type == 'LINE':
            bbox = parse_bbox(block.get('Geometry', {}).get('BoundingBox', {}))
            page = block.get('Page', 1)
            text = block.get('Text', '')
            lines.append(text)

            result.fields.append(ExtractedField(
                field_name=f"line_{len(result.fields)}",
                value=text,
                confidence=block.get('Confidence', 0) / 100,
                page=page,
                bbox=bbox,
                field_type="text",
                source_text=text,
            ))

        # Extract checkboxes (SELECTION_ELEMENT)
        elif block_type == 'SELECTION_ELEMENT':
            bbox = parse_bbox(block.get('Geometry', {}).get('BoundingBox', {}))
            page = block.get('Page', 1)
            is_selected = block.get('SelectionStatus') == 'SELECTED'
            confidence = block.get('Confidence', 0) / 100

            result.checkboxes.append(ExtractedField(
                field_name=f"checkbox_{len(result.checkboxes)}",
                value=is_selected,
                confidence=confidence,
                page=page,
                bbox=bbox,
                field_type="checkbox",
                is_selected=is_selected,
            ))

        # Extract key-value pairs
        elif block_type == 'KEY_VALUE_SET':
            entity_type = block.get('EntityTypes', [])

            if 'KEY' in entity_type:
                # Find the key text
                key_text = get_text_from_block(block, block_map)

                # Find associated value
                value_block_id = None
                for rel in block.get('Relationships', []):
                    if rel['Type'] == 'VALUE':
                        value_block_id = rel['Ids'][0] if rel['Ids'] else None
                        break

                if value_block_id and value_block_id in block_map:
                    value_block = block_map[value_block_id]
                    value_text = get_text_from_block(value_block, block_map)

                    # Check if value is a checkbox
                    is_checkbox = False
                    checkbox_selected = None
                    checkbox_bbox = None
                    for rel in value_block.get('Relationships', []):
                        if rel['Type'] == 'CHILD':
                            for child_id in rel['Ids']:
                                child = block_map.get(child_id, {})
                                if child.get('BlockType') == 'SELECTION_ELEMENT':
                                    is_checkbox = True
                                    checkbox_selected = child.get('SelectionStatus') == 'SELECTED'
                                    # Get the checkbox's actual bbox for precise highlighting
                                    checkbox_bbox = parse_bbox(child.get('Geometry', {}).get('BoundingBox', {}))
                                    break

                    # KEY bbox (question label) vs VALUE bbox (answer location)
                    key_bbox = parse_bbox(block.get('Geometry', {}).get('BoundingBox', {}))
                    value_bbox = parse_bbox(value_block.get('Geometry', {}).get('BoundingBox', {}))
                    page = block.get('Page', 1)
                    confidence = block.get('Confidence', 0) / 100

                    if is_checkbox:
                        result.key_value_pairs[key_text] = {
                            "value": checkbox_selected,
                            "type": "checkbox",
                            "confidence": confidence,
                            "page": page,
                            # Use checkbox bbox if available, otherwise value block bbox
                            "bbox": (checkbox_bbox or value_bbox).to_dict(),
                            "key_bbox": key_bbox.to_dict(),  # Question label location
                        }
                    else:
                        result.key_value_pairs[key_text] = {
                            "value": value_text,
                            "type": "text",
                            "confidence": confidence,
                            "page": page,
                            "bbox": value_bbox.to_dict(),  # Answer location
                            "key_bbox": key_bbox.to_dict(),  # Question label location
                        }

    result.pages = total_pages or page_count or 1
    result.raw_text = '\n'.join(lines)

    return result


def parse_bbox(bbox_dict: dict) -> BoundingBox:
    """Parse Textract bounding box format."""
    return BoundingBox(
        left=bbox_dict.get('Left', 0),
        top=bbox_dict.get('Top', 0),
        width=bbox_dict.get('Width', 0),
        height=bbox_dict.get('Height', 0),
    )


def get_text_from_block(block: dict, block_map: dict) -> str:
    """Extract text content from a block by following CHILD relationships."""
    text_parts = []

    for rel in block.get('Relationships', []):
        if rel['Type'] == 'CHILD':
            for child_id in rel['Ids']:
                child = block_map.get(child_id, {})
                if child.get('BlockType') == 'WORD':
                    text_parts.append(child.get('Text', ''))

    return ' '.join(text_parts)


def find_text_coordinates(result: TextractResult, search_text: str) -> list[dict]:
    """
    Find all occurrences of text and return their coordinates.

    Useful for highlighting specific extracted values.
    """
    matches = []
    search_lower = search_text.lower()

    for field in result.fields:
        if field.source_text and search_lower in field.source_text.lower():
            matches.append({
                "text": field.source_text,
                "page": field.page,
                "bbox": field.bbox.to_dict(),
                "confidence": field.confidence,
            })

    return matches


# Convenience function for testing
def test_extraction(file_path: str):
    """Test extraction on a file and print results."""
    print(f"Extracting from: {file_path}")

    try:
        result = extract_from_pdf(file_path)

        print(f"\nPages: {result.pages}")
        print(f"Text lines: {len(result.fields)}")
        print(f"Checkboxes found: {len(result.checkboxes)}")
        print(f"Key-value pairs: {len(result.key_value_pairs)}")

        print("\n--- Checkboxes ---")
        for cb in result.checkboxes[:10]:
            status = "SELECTED" if cb.is_selected else "NOT SELECTED"
            print(f"  [{status}] conf={cb.confidence:.2f} page={cb.page} bbox={cb.bbox.to_dict()}")

        print("\n--- Key-Value Pairs ---")
        for key, val in list(result.key_value_pairs.items())[:10]:
            print(f"  {key}: {val['value']} (type={val['type']}, conf={val['confidence']:.2f})")

        return result

    except Exception as e:
        print(f"Error: {e}")
        raise


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        test_extraction(sys.argv[1])
    else:
        print("Usage: python textract_extractor.py <pdf_file>")
