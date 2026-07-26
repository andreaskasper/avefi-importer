<?php

class API {
	
	private static $namespace = null;
	private static $method = null;
	private static $data = null;
	private static $format = null;
	private static $pgmstart = null;

	public static function run($namespace, $method, $format, $data) {
		self::$pgmstart = microtime(true);
		$_REQUEST["_namespace"] = $namespace;
		$_REQUEST["_method"] = $method;
		$_REQUEST["_format"] = $format;
		if (!class_exists("\\API\\".$namespace)) { self::sendError("unknown Namespace", 1); exit(); }
		if (!method_exists("\\API\\".$namespace, $method)) { self::sendError("unknown Method", 2); exit(); }
		try {
			$result = call_user_func(array("\\API\\".$namespace, $method), $_REQUEST);
		} catch (Exception $e) {
			self::sendError($e->getMessage(), $e->getCode());
		}
		self::sendResult($result);
	}

	public static function sendResult($result) {
		self::send(array("error" => array("id" => 0, "msg" => ""), "result" => $result));
		exit();
	}

	public static function sendResultJson($result) {
		$_REQUEST["_format"] = "json";
		self::sendResult($result);
		exit();
	}

	public static function sendError(string $msg, ?int $id = null) {
		if (is_null($id)) $id = 1;
		self::send(array("error" => array("id" => $id, "msg" => $msg), "result" => null));
		exit();
	}

	public static function sendErrorJson(string $msg, ?int $id = null) {
		$_REQUEST["_format"] = "json";
		self::sendError($msg, $id);
		exit();
	}
	
	public static function send($data) {
		$data["runtime"] = microtime(true)-self::$pgmstart;
		switch($_REQUEST["_format"]) {
			case "successcode": 
				header("Content-Type: text/plain");
				if ($data["error"]["id"]+0 == 0) @header($_SERVER["SERVER_PROTOCOL"]." 200 Ok"); else header($_SERVER["SERVER_PROTOCOL"]." 400 ".$data["err"]["msg"]);
				echo($data["error"]["id"]+0); break;
			case "json": 
				//CORS Headers
				header("Content-Type: application/json");
				header("Access-Control-Allow-Origin: *");
				header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
				header("Access-Control-Allow-Headers: Content-Type, Authorization");
				header("Access-Control-Allow-Credentials: true");

				$data["request"] = $_REQUEST;
				echo(json_encode($data)); break;
			case "jsonac": 
				header("Content-Type: application/json");
				echo(json_encode($data["result"])); break;
			case "json-in-script":
				header("Content-Type: text/javascript");
				$data["request"] = $_REQUEST;
				if ($_REQUEST["callback"]."" == "") $_REQUEST["callback"] = str_replace(array("/"), "_", $_REQUEST["action"]);
				echo(strip_tags($_REQUEST["callback"])."(".json_encode($data).");"); break;
			case "php":
				$data["request"] = $_REQUEST;
				echo(serialize($data)); break;			
			case "html":
				$data["request"] = $_REQUEST;
				echo('<table><tr><td>'.self::array2html($data).'</td></tr></table>'); break;
			case "plain":
			case "txt":
			case "raw":
				header("Content-Type: text/plain; charset=utf-8");
				if ($data["error"]["id"]+0 == 0) @header($_SERVER["SERVER_PROTOCOL"]." 200 Ok"); else header($_SERVER["SERVER_PROTOCOL"]." 400 ".$data["err"]["msg"]);
				if ($data["error"]["id"] != 0) die("ERR:".$data["err"]["id"].";".$data["err"]["msg"]);
				if (is_array($data["result"])) { foreach($data["result"] as $a) echo((string)$a."\r\n"); break;}
				echo((string)$data["result"]); break;
		case "csv":
			//check result
			if (!is_array($data["result"])) $data["result"] = array($data["result"]);
			//flatten
			$j = true;
			while (true) {
				$tmp = array();
				$j = false;
				foreach ($data["result"] as $k3 => $v3) foreach($v3 as $k => $v) {
					if (!is_array($v)) $tmp[$k3][$k] = $v;
					else foreach ($v as $k2 => $v2) { $tmp[$k3][$k."_".$k2] = $v2; $j = true; }
				}
				$data["result"] = $tmp;
				if (!$j) break;
			}

			//foreach ($data["result"] as $row) foreach ($row as $col) if (is_array($col)) die("No Multi-Dimensional as Result");
			header('Content-Encoding: UTF-8');
			header('Content-type: text/csv; charset=UTF-8');
			echo "\xEF\xBB\xBF";

			//HEader Spalten
			$cols = array();
			foreach ($data["result"] as $row) {
				if (!is_array($row)) $row = array($row);
				foreach ($row as $col => $val) {
					if (!in_array($col, $cols)) $cols[] = $col;
				}
			}

			foreach ($cols as $col) {
				if (is_numeric($col)) echo($col); 
				elseif (is_string($col)) echo('"'.str_replace(array('"'), array('""'),$col).'"');
				else echo('"'.str_replace(array('"'), array('""'),json_encode($col)).'"');
				echo(";");
			}
			echo(PHP_EOL);
			
			//Datenausgabe
			foreach ($data["result"] as $row) {
				if (!is_array($row)) $row = array($row);
				foreach ($cols as $a) {
					if (isset($row[$a])) $col = $row[$a]; else $col = null;
					
					if ($col == null) echo("");
					elseif (is_numeric($col)) echo($col); 
					elseif (is_string($col)) echo('"'.str_replace(array('"'), array('""'),$col).'"');
					else echo('"'.str_replace(array('"'), array('""'),json_encode($col)).'"');
					echo(';');
				}
				echo(PHP_EOL);
			}
			break;
		case "xml":
		default: 
			header("Content-Type: text/xml");
			$data["Request"] = $_REQUEST;
			echo(self::array2xml($data, $wgXMLRoot));
//			echo(Array2XML($data, true));
			break;
	}
	exit(1);
	}
	
	private static function array2xml( $data, $rootNodeName = "data", SimpleXMLElement $xml = null) {
		if ($xml == null) $xml = simplexml_load_string("<?xml version='1.0' encoding='utf-8'?><data />");
		foreach($data as $key => $value) {
			// no numeric keys in our xml please!
			//if (is_numeric($key)) $key = "item". (string) $key;
			if (is_numeric($key)) $key = "item";
			//$key = preg_replace('/[^a-z]/i', '', $key);
			if (is_array($value)) {
				$node = $xml->addChild($key);
				self::array2xml($value, (string)$rootNodeName, $node);
			} else {
				if (is_bool($value)) {
					if ($value) $value="true"; else $value="false";
				}
				$value = $value;
				$xml->addChild($key, $value);
			}
		}
		return $xml->asXML();
	}

	private static function array2html(array $array) {
		$out = '<table border="1" cellspacing="0" width="100%">'.chr(13);
		foreach ($array as $key=>$value) {
			$out .= '<tr><th>'.$key.'</th><td>';
			if (is_array($value)) $out .= self::array2html($value); 
			elseif (is_null($value)) $out .= '<i>null</i>';
			else $out .= htmlentities($value, 3, "UTF-8");
			$out .= '</td></tr>'.chr(13);
		}
		$out .= '</table>'.chr(13);
		return $out;
	}

	public static function check304(\DateTime $lastModified) {
		if (isset($_SERVER["HTTP_IF_MODIFIED_SINCE"]) && strtotime($_SERVER["HTTP_IF_MODIFIED_SINCE"]) >= $lastModified->getTimestamp()) {
			header("HTTP/1.1 304 Not Modified");
			exit();
		} else {
			header("Last-Modified: ".$lastModified->format(DateTime::RFC1123));
		}
	}
	
}