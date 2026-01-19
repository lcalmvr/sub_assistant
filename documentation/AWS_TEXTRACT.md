# AWS Textract Documentation

This document provides Claude Code context for using AWS Textract in this project.

## Project Usage

AWS Textract is used for document OCR with form extraction:

| File | Purpose |
|------|---------|
| `ai/textract_extractor.py` | PDF/image OCR with bounding boxes, checkbox detection, key-value pairs |

## Environment Variables

```
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_DEFAULT_REGION=us-east-1
```

## Client Initialization

```python
import boto3
from dotenv import load_dotenv

load_dotenv()

client = boto3.client(
    'textract',
    region_name=os.environ.get('AWS_DEFAULT_REGION', 'us-east-1')
)
```

## Synchronous Document Analysis

For single-page documents or images:

```python
# From bytes (image or single-page PDF converted to image)
response = client.analyze_document(
    Document={'Bytes': image_bytes},
    FeatureTypes=['FORMS']  # Extract key-value pairs
)

# Process response blocks
for block in response.get('Blocks', []):
    block_type = block['BlockType']
    # PAGE, LINE, WORD, KEY_VALUE_SET, SELECTION_ELEMENT, etc.
```

## Feature Types

| Feature | Description |
|---------|-------------|
| `FORMS` | Extract key-value pairs from forms |
| `TABLES` | Extract tabular data |
| `QUERIES` | Query-based extraction |
| `SIGNATURES` | Detect signatures |
| `LAYOUT` | Document layout analysis |

```python
response = client.analyze_document(
    Document={'Bytes': image_bytes},
    FeatureTypes=['FORMS', 'TABLES']
)
```

## Block Types

| BlockType | Description |
|-----------|-------------|
| `PAGE` | Page boundary |
| `LINE` | Line of text |
| `WORD` | Individual word |
| `KEY_VALUE_SET` | Form field key or value |
| `SELECTION_ELEMENT` | Checkbox/radio button |
| `TABLE` | Table structure |
| `CELL` | Table cell |

## Bounding Boxes

Every block includes geometry with normalized coordinates (0-1):

```python
@dataclass
class BoundingBox:
    left: float   # X position (0-1)
    top: float    # Y position (0-1)
    width: float  # Width (0-1)
    height: float # Height (0-1)

    def to_pixels(self, page_width: int, page_height: int) -> dict:
        return {
            "x": int(self.left * page_width),
            "y": int(self.top * page_height),
            "width": int(self.width * page_width),
            "height": int(self.height * page_height),
        }

# Parse from Textract response
def parse_bbox(bbox_dict: dict) -> BoundingBox:
    return BoundingBox(
        left=bbox_dict.get('Left', 0),
        top=bbox_dict.get('Top', 0),
        width=bbox_dict.get('Width', 0),
        height=bbox_dict.get('Height', 0),
    )
```

## Extracting Key-Value Pairs

```python
def extract_key_values(blocks: list) -> dict:
    block_map = {b['Id']: b for b in blocks}
    key_values = {}

    for block in blocks:
        if block['BlockType'] != 'KEY_VALUE_SET':
            continue
        if 'KEY' not in block.get('EntityTypes', []):
            continue

        # Get key text
        key_text = get_text_from_block(block, block_map)

        # Find associated value
        for rel in block.get('Relationships', []):
            if rel['Type'] == 'VALUE':
                value_block_id = rel['Ids'][0] if rel['Ids'] else None
                if value_block_id and value_block_id in block_map:
                    value_block = block_map[value_block_id]
                    value_text = get_text_from_block(value_block, block_map)
                    key_values[key_text] = value_text
                break

    return key_values

def get_text_from_block(block: dict, block_map: dict) -> str:
    text_parts = []
    for rel in block.get('Relationships', []):
        if rel['Type'] == 'CHILD':
            for child_id in rel['Ids']:
                child = block_map.get(child_id, {})
                if child.get('BlockType') == 'WORD':
                    text_parts.append(child.get('Text', ''))
    return ' '.join(text_parts)
```

## Checkbox Detection

```python
for block in blocks:
    if block['BlockType'] == 'SELECTION_ELEMENT':
        is_selected = block.get('SelectionStatus') == 'SELECTED'
        confidence = block.get('Confidence', 0) / 100
        bbox = parse_bbox(block.get('Geometry', {}).get('BoundingBox', {}))
        page = block.get('Page', 1)

        print(f"Checkbox: {'SELECTED' if is_selected} "
              f"conf={confidence:.2f} page={page}")
```

## Async Analysis for Multi-Page PDFs

For documents larger than 1 page, use async API:

```python
# Upload to S3 first
s3 = boto3.client('s3')
s3.upload_fileobj(file_obj, s3_bucket, s3_key)

# Start async analysis
response = client.start_document_analysis(
    DocumentLocation={
        'S3Object': {
            'Bucket': s3_bucket,
            'Name': s3_key,
        }
    },
    FeatureTypes=['FORMS']
)
job_id = response['JobId']

# Poll for completion
while True:
    response = client.get_document_analysis(JobId=job_id)
    if response['JobStatus'] == 'SUCCEEDED':
        break
    elif response['JobStatus'] == 'FAILED':
        raise Exception(response.get('StatusMessage'))
    time.sleep(5)

# Get all pages (paginated)
all_blocks = response['Blocks']
while 'NextToken' in response:
    response = client.get_document_analysis(
        JobId=job_id,
        NextToken=response['NextToken']
    )
    all_blocks.extend(response['Blocks'])
```

## PDF to Image Conversion

Textract's synchronous API requires images, so convert PDF pages:

```python
from pdf2image import convert_from_path
import io

images = convert_from_path(file_path, dpi=200, first_page=1, last_page=max_pages)

for page_num, img in enumerate(images, 1):
    img_buffer = io.BytesIO()
    img.save(img_buffer, format='PNG')
    img_bytes = img_buffer.getvalue()

    response = client.analyze_document(
        Document={'Bytes': img_bytes},
        FeatureTypes=['FORMS']
    )
```

## Textractor Library (Alternative)

AWS provides a higher-level Python library:

```python
from textractor import Textractor
from textractor.data.constants import TextractFeatures

extractor = Textractor(profile_name="default")

document = extractor.analyze_document(
    file_source="form.pdf",
    features=[TextractFeatures.FORMS]
)

# Search for specific key
document.get("email")  # Fuzzy matching

# Access all key-values
document.key_values

# Export to CSV
document.export_kv_to_csv(
    include_kv=True,
    include_checkboxes=False,
    filepath="kv.csv"
)
```

## Cost

- AnalyzeDocument with FORMS: ~$0.015/page
- Async analysis may have different pricing

## Best Practices

1. **Use Async for Multi-Page** - Sync API only handles single pages
2. **PDF Conversion** - Convert PDF to images at 200+ DPI for best accuracy
3. **Confidence Scores** - Filter results by confidence threshold
4. **Bounding Boxes** - Store for UI highlighting of extracted values
5. **Error Handling** - Handle rate limits and transient AWS errors

## References

- [AWS Textract Documentation](https://docs.aws.amazon.com/textract/)
- [Boto3 Textract Client](https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/textract.html)
- [Amazon Textract Textractor](https://github.com/aws-samples/amazon-textract-textractor)
