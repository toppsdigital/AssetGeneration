from psd_tools import PSDImage
from PIL import Image
import os
import json
import logging
import numpy as np
import sys
import glob
import shutil

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def get_available_psd_files():
    """Get list of available PSD files from inputs folder"""
    inputs_dir = "inputs"
    if not os.path.exists(inputs_dir):
        os.makedirs(inputs_dir)
        logger.info(f"Created {inputs_dir} folder. Please add your PSD files there.")
        return []
    
    psd_files = glob.glob(os.path.join(inputs_dir, "*.psd"))
    return [os.path.basename(f) for f in psd_files]

def process_psd_file(psd_filename):
    """Process a specific PSD file"""
    # Check if the filename is a full path
    if os.path.isabs(psd_filename):
        psd_path = psd_filename
        psd_filename = os.path.basename(psd_filename)
    else:
        # Default to /tmp directory for downloaded files
        psd_path = os.path.join('/tmp', psd_filename)
    
    if not os.path.exists(psd_path):
        logger.error(f"PSD file not found: {psd_path}")
        return False
    
    logger.info(f"Processing PSD file: {psd_filename}")
    
    try:
        # Load PSD with error handling for color mode
        psd = PSDImage.open(psd_path)
    except ValueError as e:
        if "is not a valid ColorMode" in str(e):
            logger.warning(f"Invalid color mode detected in PSD file. Attempting to process with fallback settings...")
            try:
                # Try to open with force=True to bypass color mode validation
                psd = PSDImage.open(psd_path, force=True)
            except Exception as inner_e:
                logger.error(f"Failed to process PSD file with fallback settings: {inner_e}")
                return False
        else:
            logger.error(f"Failed to process PSD file: {e}")
            return False

    # Output folders
    public_temp_dir = os.path.join('public', 'temp', os.path.splitext(psd_filename)[0])
    preview_dir = os.path.join(public_temp_dir, "previews")
    os.makedirs(preview_dir, exist_ok=True)

    # Clear previous previews
    for file in glob.glob(os.path.join(preview_dir, "*")):
        try:
            os.remove(file)
        except:
            pass

    layer_json = []

    def analyze_image_content(image):
        """Analyze if an image is truly empty or has content"""
        if not image:
            return {"is_empty": True, "reason": "no_image"}
        
        # Convert to numpy array for analysis
        img_array = np.array(image)
        
        # Check if image has alpha channel
        has_alpha = image.mode in ('RGBA', 'LA') or 'transparency' in image.info
        
        if has_alpha and image.mode == 'RGBA':
            # Check alpha channel
            alpha_channel = img_array[:, :, 3] if len(img_array.shape) == 3 and img_array.shape[2] >= 4 else None
            if alpha_channel is not None:
                non_transparent_pixels = np.sum(alpha_channel > 0)
                total_pixels = alpha_channel.size
                transparency_ratio = 1 - (non_transparent_pixels / total_pixels)
                
                # Check RGB content where alpha > 0
                if non_transparent_pixels > 0:
                    # Get RGB values where alpha > 0
                    rgb_data = img_array[:, :, :3][alpha_channel > 0]
                    has_color_variation = np.std(rgb_data) > 1  # Some color variation threshold
                    
                    return {
                        "is_empty": False,
                        "non_transparent_pixels": int(non_transparent_pixels),
                        "total_pixels": int(total_pixels),
                        "transparency_ratio": float(transparency_ratio),
                        "has_color_variation": bool(has_color_variation),
                        "rgb_std": float(np.std(rgb_data)),
                        "size": image.size
                    }
                else:
                    return {
                        "is_empty": True,
                        "reason": "fully_transparent",
                        "total_pixels": int(total_pixels),
                        "size": image.size
                    }
        else:
            # No alpha channel, check for color variation
            if len(img_array.shape) == 3:
                color_std = np.std(img_array)
            else:
                color_std = np.std(img_array)
            
            unique_colors = len(np.unique(img_array.reshape(-1, img_array.shape[-1] if len(img_array.shape) == 3 else 1), axis=0))
            
            return {
                "is_empty": color_std < 1 and unique_colors <= 1,
                "reason": "no_color_variation" if color_std < 1 else "has_content",
                "color_std": float(color_std),
                "unique_colors": int(unique_colors),
                "size": image.size
            }

    def get_layer_properties(layer):
        """Get detailed layer properties for diagnostics"""
        properties = {
            "kind": getattr(layer, 'kind', 'unknown'),
            "visible": layer.visible,
            "opacity": getattr(layer, 'opacity', None),
            "blend_mode": str(getattr(layer, 'blend_mode', None)),
            "has_mask": getattr(layer, 'has_mask', lambda: False)(),
            "has_vector_mask": getattr(layer, 'has_vector_mask', lambda: False)(),
            "has_effects": getattr(layer, 'has_effects', lambda: False)(),
            "clipping_layer": getattr(layer, 'clipping_layer', None),
            "bbox": list(layer.bbox) if hasattr(layer, 'bbox') else None,
            "size": [layer.width, layer.height] if hasattr(layer, 'width') and hasattr(layer, 'height') else None
        }
        
        # Add layer-specific properties
        if hasattr(layer, 'text') and layer.text:
            properties["text"] = layer.text
            
            # Extract detailed text styling information
            text_style = {}
            
            # Try to get text engine data for detailed styling
            if hasattr(layer, '_record') and layer._record:
                try:
                    # Look for text engine data in the layer record
                    record = layer._record
                    if hasattr(record, 'tagged_blocks'):
                        for block in record.tagged_blocks:
                            if hasattr(block, 'key') and block.key == b'TySh':  # Text engine data
                                # Extract text styling information
                                if hasattr(block, 'data'):
                                    # This contains the text engine data with font info
                                    text_style["has_engine_data"] = True
                            elif hasattr(block, 'key') and block.key == b'tySh':  # Alternative text data
                                text_style["has_alt_text_data"] = True
                except Exception as e:
                    logger.debug(f"Could not extract text engine data for layer '{layer.name}': {e}")
            
            # Try to get font information from layer attributes
            try:
                if hasattr(layer, 'text_data'):
                    text_data = layer.text_data
                    if text_data:
                        text_style["font_family"] = getattr(text_data, 'font', None)
                        text_style["font_size"] = getattr(text_data, 'size', None)
                        text_style["color"] = getattr(text_data, 'color', None)
                        
                # Alternative: check for engine_dict
                if hasattr(layer, 'engine_dict'):
                    engine_dict = layer.engine_dict
                    if engine_dict:
                        # Extract font information from engine dict
                        if 'StyleRun' in engine_dict:
                            style_runs = engine_dict['StyleRun']
                            if style_runs and len(style_runs) > 0:
                                first_style = style_runs[0]
                                if 'StyleSheet' in first_style:
                                    stylesheet = first_style['StyleSheet']
                                    if 'StyleSheetData' in stylesheet:
                                        style_data = stylesheet['StyleSheetData']
                                        text_style["font_family"] = style_data.get('Font', None)
                                        text_style["font_size"] = style_data.get('FontSize', None)
                                        text_style["color"] = style_data.get('FillColor', None)
                                        text_style["tracking"] = style_data.get('Tracking', None)
                                        text_style["leading"] = style_data.get('Leading', None)
                        
                        # Extract paragraph information
                        if 'ParagraphRun' in engine_dict:
                            para_runs = engine_dict['ParagraphRun']
                            if para_runs and len(para_runs) > 0:
                                first_para = para_runs[0]
                                if 'ParagraphSheet' in first_para:
                                    para_sheet = first_para['ParagraphSheet']
                                    if 'ParagraphSheetData' in para_sheet:
                                        para_data = para_sheet['ParagraphSheetData']
                                        text_style["alignment"] = para_data.get('Alignment', None)
                                        text_style["justification"] = para_data.get('Justification', None)
                        
                        # Extract transform information
                        if 'Transform' in engine_dict:
                            transform = engine_dict['Transform']
                            text_style["transform"] = {
                                "xx": transform.get('xx', 1.0),
                                "xy": transform.get('xy', 0.0),
                                "yx": transform.get('yx', 0.0),
                                "yy": transform.get('yy', 1.0),
                                "tx": transform.get('tx', 0.0),
                                "ty": transform.get('ty', 0.0)
                            }
                            
            except Exception as e:
                logger.debug(f"Could not extract detailed text styling for layer '{layer.name}': {e}")
            
            # If we found any text styling information, add it to properties
            if text_style:
                properties["text_style"] = text_style
        
        return properties

    def export_layer(layer, prefix=""):
        kind = getattr(layer, 'kind', 'group')
        preview_filename = None
        preview_status = "not_attempted"
        image_analysis = None
        layer_properties = get_layer_properties(layer)

        if not layer.is_group():
            try:
                # Try multiple extraction methods
                image = None
                extraction_method = None
                
                # Method 1: topil() - raw pixel data
                try:
                    image = layer.topil()
                    if image:
                        extraction_method = "topil"
                        logger.info(f"Extracted layer '{layer.name}' using topil() with size {image.size}")
                except Exception as e:
                    logger.warning(f"topil() failed for layer '{layer.name}': {e}")
                
                # Method 2: composite() fallback
                if not image and layer.has_pixels():
                    try:
                        image = layer.composite()
                        if image:
                            extraction_method = "composite"
                            logger.info(f"Extracted layer '{layer.name}' using composite() with size {image.size}")
                    except Exception as e:
                        logger.warning(f"composite() failed for layer '{layer.name}': {e}")
                
                # Method 3: Try with force parameter for composite
                if not image and hasattr(layer, 'composite'):
                    try:
                        image = layer.composite(force=True)
                        if image:
                            extraction_method = "composite_forced"
                            logger.info(f"Extracted layer '{layer.name}' using forced composite() with size {image.size}")
                    except Exception as e:
                        logger.warning(f"forced composite() failed for layer '{layer.name}': {e}")

                if image:
                    # Analyze the extracted image
                    image_analysis = analyze_image_content(image)
                    
                    preview_filename = f"{prefix}_{layer.name}.png".replace(" ", "_").replace("/", "-")
                    image.save(os.path.join(preview_dir, preview_filename))
                    
                    if image_analysis.get("is_empty", True):
                        preview_status = f"extracted_but_empty_{image_analysis.get('reason', 'unknown')}"
                        logger.warning(f"Layer '{layer.name}' extracted but appears empty: {image_analysis}")
                    else:
                        preview_status = f"success_{extraction_method}"
                        logger.info(f"Layer '{layer.name}' successfully extracted with content using {extraction_method}")
                else:
                    if layer.has_pixels():
                        preview_status = "has_pixels_but_no_extraction"
                        logger.error(f"Layer '{layer.name}' claims to have pixels but all extraction methods failed")
                    else:
                        preview_status = "no_pixels"
                        logger.info(f"Layer '{layer.name}' has no pixel data (expected for {kind} layers)")

            except Exception as e:
                preview_status = "error"
                logger.error(f"Error processing layer '{layer.name}': {e}")

        layer_dict = {
            "id": layer.layer_id,
            "name": layer.name,
            "type": kind,
            "preview_status": preview_status,
            "layer_properties": layer_properties
        }
        
        if image_analysis:
            layer_dict["image_analysis"] = image_analysis
        
        if preview_filename:
            layer_dict["preview"] = preview_filename
            
        if layer.is_group():
            layer_dict["children"] = [export_layer(child, f"{prefix}_{layer.name}") for child in layer]

        return layer_dict

    # Extract all layers
    logger.info(f"Starting extraction of PSD with {len(psd)} top-level layers")
    layer_json = [export_layer(layer, layer.name) for layer in psd]

    # Generate summary report
    total_layers = 0
    successful_extractions = 0
    empty_extractions = 0
    failed_extractions = 0

    def count_layers(layers):
        nonlocal total_layers, successful_extractions, empty_extractions, failed_extractions
        for layer in layers:
            if not layer.get("children"):  # Only count leaf layers
                total_layers += 1
                status = layer.get("preview_status", "")
                if "success" in status:
                    if "empty" in status:
                        empty_extractions += 1
                    else:
                        successful_extractions += 1
                else:
                    failed_extractions += 1
            if layer.get("children"):
                count_layers(layer["children"])

    count_layers(layer_json)

    # Save JSON with detailed information
    output_data = {
        "psd_file": psd_filename,
        "summary": {
            "total_layers": total_layers,
            "successful_extractions": successful_extractions,
            "empty_extractions": empty_extractions,
            "failed_extractions": failed_extractions,
            "psd_info": {
                "size": [psd.width, psd.height],
                "color_mode": str(psd.color_mode),
                "depth": psd.depth
            }
        },
        "layers": layer_json
    }

    with open(os.path.join(public_temp_dir, "layer_structure.json"), "w", encoding="utf-8") as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)

    logger.info(f"Layer extraction completed!")
    logger.info(f"Summary: {successful_extractions} successful, {empty_extractions} empty, {failed_extractions} failed out of {total_layers} total layers")
    logger.info("Check layer_structure.json for detailed analysis of each layer.")
    
    logger.info(f"Output saved to: {public_temp_dir}")
    return True

if __name__ == "__main__":
    if len(sys.argv) > 1:
        # Process specific file from command line
        psd_filename = sys.argv[1]
        if not psd_filename.endswith('.psd'):
            psd_filename += '.psd'
        process_psd_file(psd_filename)
    else:
        # List available files
        available_files = get_available_psd_files()
        if available_files:
            print("Available PSD files:")
            for i, file in enumerate(available_files, 1):
                print(f"{i}. {file}")
            print("\nUsage: python generate_preview_and_json.py <filename>")
        else:
            print("No PSD files found in inputs folder. Please add PSD files to the inputs directory.")